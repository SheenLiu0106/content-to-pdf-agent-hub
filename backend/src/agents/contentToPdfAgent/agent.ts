import type { UseCase, PdfRenderConfig } from "../../shared/useCaseSchema.js";
import type {
  ExtractAgentResponse,
  IntakeAssessment,
  PdfQualityReport,
  RepairAction,
} from "../../shared/agentTypes.js";
import {
  TEMPLATE_DEFINITIONS,
  getTemplateDefinition,
  isArticleFamilyType,
  recommendTemplate,
} from "../../shared/templates.js";
import {
  assignVisualsToSections,
  extractInlineVisuals,
  mergeInlineVisuals,
} from "../../shared/extractInlineVisuals.js";
import {
  normalizeCaseStudySummary,
  normalizeUseCase,
  trimSummaryToLegacyCaps,
} from "../../shared/normalizeUseCase.js";
import { resolveInlineVisualUrls } from "../../pdf/fetchInlineVisualUrls.js";
import { renderPdf } from "../../pdf/renderer.js";
import { runIntake, detectUseCaseSignal } from "./intake.js";
import { runStrategy } from "./strategy.js";
import { runExtraction } from "./extraction.js";
import { runContentEditor } from "./contentEditor.js";
import { runLayoutPlanner } from "./layoutPlanner.js";
import { runQualityReview } from "./qualityReview.js";
import {
  MAX_REPAIR_ATTEMPTS,
  applyActions,
  applyLayoutToRenderConfig,
  planRepair,
} from "./repair.js";

// Pre-render phase: Intake → Strategy → Extraction → Content Editor →
// Layout Planner. Returns the editable UseCase plus the agent's decisions
// for the frontend to surface. Run from /api/extract.
export async function runExtractAgent(
  rawContent: string,
  preRenderConfig?: Pick<
    PdfRenderConfig,
    "pdfLengthMode" | "documentLabel" | "templateId"
  >
): Promise<ExtractAgentResponse> {
  const intake = runIntake(rawContent);

  // Deterministically pull image references (Markdown / HTML / placeholders)
  // out of the raw text before the LLM sees it. The LLM is not asked to
  // preserve image URLs verbatim — it gets the cleaned text and may emit
  // image_slot recommendations of its own (see prompt's Inline Visual rules).
  const preprocessed = extractInlineVisuals(rawContent);
  const extracted = await runExtraction(preprocessed.cleanedText || rawContent);

  // Sync intake's content type and template recommendation with the LLM's
  // verdict. The intake heuristic runs pre-LLM on raw text — cheap but
  // limited. The LLM sees the full document and a prompt that knows how to
  // distinguish conceptual writing from concrete customer implementations,
  // so we trust it for the user-visible recommendation. Strategy and the
  // layout plan are then derived from the synced intake so the badge,
  // recommendation rationale, template card, and PDF layout all agree.
  const llmRecommendation = recommendTemplate(extracted.contentType, rawContent);
  let detectedContentType = extracted.contentType;
  let templateRecommendation = llmRecommendation;

  // Deterministic use-case signal layer. The extraction prompt is
  // intentionally conservative ("prefer general_article when uncertain"),
  // which mis-files narratively-written success stories — no named customer
  // or quantified metric — as articles. When the LLM lands on the article
  // family but the raw source carries explicit success-story/case-study
  // framing or a concrete challenge→solution→outcome structure, the
  // deterministic signal wins. Memo and existing case-study verdicts are left
  // untouched.
  if (isArticleFamilyType(extracted.contentType)) {
    const signal = detectUseCaseSignal(rawContent);
    if (signal.isUseCase) {
      detectedContentType = signal.contentType;
      templateRecommendation = recommendTemplate(signal.contentType, rawContent);
    }
  }

  const syncedIntake: IntakeAssessment = {
    ...intake,
    detectedContentType,
    recommendedTemplate: templateRecommendation.templateId,
    templateRecommendation,
    confidence: 0.8,
  };
  const strategy = runStrategy(syncedIntake, preRenderConfig);

  // Merge preprocessor-detected visuals (real URLs/placeholders from source)
  // with the LLM's recommendation slots, then assign each preprocessor
  // visual to the closest narrative section. Re-run normalize so the merged
  // result honors caps and the article-only gate.
  const preprocessorVisuals = assignVisualsToSections(
    rawContent,
    preprocessed.inlineVisuals,
    extracted.narrativeSections
  );
  const mergedVisuals = mergeInlineVisuals(
    preprocessorVisuals,
    extracted.inlineVisuals ?? []
  );
  // Pass the resolved template so the summary-bullet policy matches what the
  // PDF will use: the Customer Case Study template gets exactly four bullets
  // per section here (so the editable payload the UI shows already reflects
  // it); Article Report / Executive Memo keep the legacy uneven caps.
  const withVisuals: UseCase = normalizeUseCase(
    {
      ...extracted,
      inlineVisuals: mergedVisuals,
    },
    { templateId: strategy.templateId }
  );

  const edited = runContentEditor(withVisuals, strategy);

  // Layout Planner needs a config-shaped object to predict the supporting
  // visual. At extract time the user hasn't chosen a supporting visual yet,
  // so we synthesize a minimal config that asks the planner to ignore the
  // visual track. The frontend re-runs layout decisions client-side via the
  // strategy chips, and /api/render-pdf re-runs the full planner against
  // the actual render-time config.
  const placeholderConfig: PdfRenderConfig = {
    templateId: strategy.templateId,
    brandName: "Your Company",
    brandWebsite: "www.example.com",
    documentLabel: strategy.documentLabel,
    brandCopyright: "© 2026 Your Company. All rights reserved.",
    primaryColor: "#0F172A",
    accentColor: "#06B6D4",
    logoDataUrl: null,
    heroImageDataUrl: null,
    supportingVisualEnabled: false,
    supportingVisualType: null,
    supportingImageDataUrl: null,
    supportingImageCaption: null,
    mermaidVerified: false,
    pdfLengthMode: preRenderConfig?.pdfLengthMode ?? "compact-2-page",
  };
  const layoutPlan = runLayoutPlanner(edited, placeholderConfig, strategy);

  return {
    content: edited,
    intake: syncedIntake,
    strategy,
    layoutPlan,
    warnings: syncedIntake.risks,
    recommendedTemplate: getTemplateDefinition(syncedIntake.recommendedTemplate),
    availableTemplates: [...TEMPLATE_DEFINITIONS],
  };
}

// Render phase: Render → Quality Review → Repair (≤2 loops) → final Render.
// Run from /api/render-pdf. The user has edited the UseCase since
// /api/extract, so we re-derive strategy + layout plan from scratch against
// the edited content.
export interface RenderAgentResult {
  pdf: Buffer;
  attempts: number;
  finalReport: PdfQualityReport;
  appliedActions: RepairAction[];
}

export async function runRenderAgent(
  content: UseCase,
  config: PdfRenderConfig,
  opts: { filename?: string } = {}
): Promise<RenderAgentResult> {
  // Only Article Report renders inline visuals. Drop them for every other
  // template at the render boundary so non-article templates can't leak
  // images and we don't waste network calls resolving URLs for nothing.
  if (config.templateId !== "article_report") {
    content = { ...content, inlineVisuals: [] };
  }

  // Resolve any inline visuals that came in as external URLs (Markdown /
  // HTML images that we never uploaded). We fetch them server-side and
  // embed as data URLs so the Playwright render doesn't depend on outbound
  // network at print time. Anything that fails to fetch is flagged
  // status:"failed" and dropped silently by the renderer.
  const resolvedVisuals =
    content.inlineVisuals && content.inlineVisuals.length > 0
      ? await resolveInlineVisualUrls(content.inlineVisuals)
      : content.inlineVisuals;
  content = { ...content, inlineVisuals: resolvedVisuals };

  // Enforce the template-scoped summary-bullet policy against the FINAL
  // template the user is rendering with. This is the authoritative guarantee
  // that every Customer Case Study PDF carries exactly four bullets per
  // section (Goals / Challenges / Solutions / Results) — even if the user
  // edited the draft or switched templates after extraction. For the other
  // two templates we re-assert the legacy caps so a case-study draft switched
  // to Article/Memo can't inflate their bullet counts.
  content =
    config.templateId === "usecase"
      ? normalizeCaseStudySummary(content)
      : trimSummaryToLegacyCaps(content);

  // Re-derive strategy + plan against the edited content. The raw paste
  // isn't available here, so Intake/Strategy run off the structured content.
  // We treat the edited UseCase as authoritative for length signals.
  const intakeStub = inferIntakeFromUseCase(content);
  let strategy = runStrategy(intakeStub, config);
  let layoutPlan = runLayoutPlanner(content, config, strategy);

  const history: RepairAction[] = [];
  const appliedActions: RepairAction[] = [];

  let currentContent = content;
  let attempts = 0;
  let report = runQualityReview(currentContent, config, layoutPlan);

  while (!report.passed && attempts < MAX_REPAIR_ATTEMPTS) {
    const actions = planRepair(report, { content: currentContent, strategy, layoutPlan }, history);
    if (actions.length === 0) break;

    const next = applyActions(actions, {
      content: currentContent,
      strategy,
      layoutPlan,
    });
    currentContent = next.content;
    strategy = next.strategy;
    layoutPlan = next.layoutPlan;
    history.push(...actions);
    appliedActions.push(...actions);

    attempts++;
    report = runQualityReview(currentContent, config, layoutPlan);
  }

  const finalConfig = applyLayoutToRenderConfig(config, layoutPlan);
  const pdf = await renderPdf(currentContent, finalConfig, opts);

  return { pdf, attempts, finalReport: report, appliedActions };
}

function inferIntakeFromUseCase(content: UseCase): IntakeAssessment {
  const totalChars =
    content.executiveSummary.length +
    content.narrativeSections.reduce((acc, s) => acc + s.body.length, 0) +
    [...content.goals, ...content.challenges, ...content.solutions, ...content.results]
      .reduce((acc, b) => acc + b.length, 0);
  const contentLength =
    totalChars < 600 ? "short" : totalChars > 2400 ? "long" : "medium";
  const templateRecommendation = recommendTemplate(content.contentType);
  return {
    contentLength,
    detectedContentType: content.contentType,
    confidence: 0.5,
    needsExpansion: contentLength === "short",
    needsCompression: contentLength === "long",
    missingFields: content.missingFields,
    recommendedTemplate: templateRecommendation.templateId,
    templateRecommendation,
    risks: [],
  };
}
