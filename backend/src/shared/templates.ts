// Single source of truth for the three PDF templates the Content-to-PDF Hub
// supports. Lives in shared/ so both the backend (renderer, agent stages,
// route validation) and the frontend (gallery, page state) import the same
// definitions. The internal `usecase` ID is kept as-is to avoid regressing
// the working Customer Case Study flow — the UI label is "Customer Case
// Study", but the slug stays `usecase`.

import type { UseCaseContentType } from "./useCaseSchema.js";

export const TEMPLATE_IDS = [
  "usecase",
  "article_report",
  "executive_memo",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface TemplateDefinition {
  id: TemplateId;
  label: string;
  description: string;
  documentLabel: string;
  filenamePrefix: string;
  supportedContentTypes: string[];
}

export const TEMPLATE_DEFINITIONS: readonly TemplateDefinition[] = [
  {
    id: "usecase",
    label: "Customer Case Study",
    description: "Best for challenge-solution-result success stories.",
    documentLabel: "CUSTOMER CASE STUDY",
    filenamePrefix: "success-story-",
    supportedContentTypes: [
      "success_story",
      "case_study",
      "use_case",
      "project_summary",
      "marketing_brief",
    ],
  },
  {
    id: "article_report",
    label: "Article Report",
    description: "Best for articles, newsletters, and thought leadership.",
    documentLabel: "ARTICLE REPORT",
    filenamePrefix: "article-report-",
    supportedContentTypes: [
      "article",
      "general_article",
      "thought_leadership",
      "newsletter",
    ],
  },
  {
    id: "executive_memo",
    label: "Executive Memo",
    description:
      "Best for internal updates, recommendations, and decision briefs.",
    documentLabel: "EXECUTIVE MEMO",
    filenamePrefix: "executive-memo-",
    supportedContentTypes: [
      "executive_memo",
      "memo",
      "decision_brief",
      "meeting_summary",
    ],
  },
];

// True when a content type belongs to the article family (maps to the
// Article Report template). Used by the deterministic use-case signal layer
// to decide whether an LLM article verdict is eligible for an upgrade —
// memo and case-study verdicts are never touched.
export function isArticleFamilyType(contentType: UseCaseContentType): boolean {
  return CONTENT_TYPE_TO_TEMPLATE[contentType] === "article_report";
}

export function getTemplateDefinition(id: TemplateId): TemplateDefinition {
  const found = TEMPLATE_DEFINITIONS.find((t) => t.id === id);
  return found ?? TEMPLATE_DEFINITIONS[0]!;
}

export function getFilenamePrefix(id: TemplateId): string {
  return getTemplateDefinition(id).filenamePrefix;
}

// Map detected content type → template. Every UseCaseContentType has an
// entry so the recommendation is deterministic without falling through to
// raw-text heuristics for the common case.
const CONTENT_TYPE_TO_TEMPLATE: Record<UseCaseContentType, TemplateId> = {
  // Case-study family
  use_case: "usecase",
  success_story: "usecase",
  case_study: "usecase",
  project_summary: "usecase",
  marketing_brief: "usecase",
  // Article family
  article: "article_report",
  general_article: "article_report",
  thought_leadership: "article_report",
  newsletter: "article_report",
  // Memo family
  executive_memo: "executive_memo",
  memo: "executive_memo",
  decision_brief: "executive_memo",
  meeting_summary: "executive_memo",
};

export interface TemplateRecommendation {
  templateId: TemplateId;
  confidence: number;
  rationale: string;
}

// Concrete-implementation cues — the *first half* of a case-study signal.
// We need both an implementation marker AND an outcome marker to recommend
// the case-study template based on raw text alone. The old regex matched
// bare "challenge|solution|results?", which appears in any analytical
// article — that bias is what caused thought-leadership content to be
// classified as Use Case.
const CASE_STUDY_IMPL_CUES_RE =
  /\b(customer|client|operator|case study|success story|customer story|deployed|implemented|rolled out|pilot)\b/i;

const CASE_STUDY_OUTCOME_CUES_RE =
  /\b(reduced|increased|improved|enabled|saved|cut by|grew by|achieved|resulted in)\b/i;

function describeTemplateChoice(
  templateId: TemplateId,
  contentType: UseCaseContentType,
  reason: "direct" | "case_study_cues" | "fallback"
): string {
  const typeLabel = contentType.replace(/_/g, " ");
  if (templateId === "usecase") {
    if (reason === "case_study_cues") {
      return "Recommended Customer Case Study because the source describes a specific implementation with measurable outcomes.";
    }
    return `Recommended Customer Case Study because the content was classified as ${typeLabel}.`;
  }
  if (templateId === "executive_memo") {
    return `Recommended Executive Memo because the content was classified as ${typeLabel} — decision-oriented or internal-business in nature.`;
  }
  // article_report
  if (reason === "fallback") {
    return "Recommended Article Report because the content is conceptual or analytical and does not describe a specific customer implementation with measurable outcomes.";
  }
  return `Recommended Article Report because the content was classified as ${typeLabel}.`;
}

export function recommendTemplate(
  contentType: UseCaseContentType,
  rawContent?: string
): TemplateRecommendation {
  const direct = CONTENT_TYPE_TO_TEMPLATE[contentType];
  if (direct) {
    // High confidence when the LLM has already classified into the family.
    return {
      templateId: direct,
      confidence: 0.85,
      rationale: describeTemplateChoice(direct, contentType, "direct"),
    };
  }

  // Belt-and-braces fallback for unknown content types (shouldn't happen
  // given the exhaustive record above, but keeps the function total).
  // Require *both* an implementation cue *and* an outcome cue before
  // recommending the case-study template from raw text — either alone is
  // not enough.
  if (
    rawContent &&
    CASE_STUDY_IMPL_CUES_RE.test(rawContent) &&
    CASE_STUDY_OUTCOME_CUES_RE.test(rawContent)
  ) {
    return {
      templateId: "usecase",
      confidence: 0.65,
      rationale: describeTemplateChoice("usecase", contentType, "case_study_cues"),
    };
  }

  return {
    templateId: "article_report",
    confidence: 0.55,
    rationale: describeTemplateChoice("article_report", contentType, "fallback"),
  };
}
