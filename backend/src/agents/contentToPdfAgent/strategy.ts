import type {
  DocumentStrategy,
  IntakeAssessment,
} from "../../shared/agentTypes.js";
import type { PdfRenderConfig } from "../../shared/useCaseSchema.js";
import { getTemplateDefinition } from "../../shared/templates.js";

// Strategy is the agent's plan for the document before extraction runs.
// Rule-based off Intake — no LLM. Length-bucket and content-type are
// strongest signals; user-provided pdfLengthMode in the render config acts
// as a hard override for the preferred page count (it was explicitly chosen
// in the brand panel, so we respect it).

export function runStrategy(
  intake: IntakeAssessment,
  config?: Pick<PdfRenderConfig, "pdfLengthMode" | "documentLabel" | "templateId">
): DocumentStrategy {
  const userPrefersCompact = config?.pdfLengthMode === "compact-2-page";

  const targetLength: DocumentStrategy["targetLength"] =
    intake.contentLength === "short"
      ? "compact"
      : intake.contentLength === "long"
        ? "expanded"
        : "standard";

  const narrativeMode: DocumentStrategy["narrativeMode"] =
    intake.contentLength === "short"
      ? "concise"
      : intake.contentLength === "long"
        ? "expanded"
        : "balanced";

  // Default: prefer 2 pages, allow 3. If user explicitly chose standard, allow
  // 3 pages and treat 3 as preferred when content is long.
  const preferredPages: 2 | 3 =
    userPrefersCompact || intake.contentLength === "short" ? 2 : 2;
  const maxPages: 2 | 3 =
    userPrefersCompact ? 2 : intake.contentLength === "long" ? 3 : 3;

  // Cover density *hint*. Layout Planner re-evaluates against the extracted
  // UseCase and may override. Short content → spacious (fill the page);
  // long content → compact (avoid overflow); medium → normal.
  const coverDensity: DocumentStrategy["coverDensity"] =
    intake.contentLength === "short"
      ? "spacious"
      : intake.contentLength === "long"
        ? "compact"
        : "normal";

  // Supporting visual policy: omit when content is short (sparse-page-3 risk),
  // dedicate when content is long (page 2 already full), try-inline otherwise.
  const supportingVisualPolicy: DocumentStrategy["supportingVisualPolicy"] =
    intake.contentLength === "short"
      ? "omit"
      : intake.contentLength === "long"
        ? "dedicated-if-strong"
        : "try-inline";

  // Template resolution: user-chosen templateId on the render config wins
  // (the picker in the right rail is explicit user intent). Otherwise fall
  // back to whatever the Intake stage recommended.
  const templateId = config?.templateId ?? intake.recommendedTemplate;
  const templateDef = getTemplateDefinition(templateId);
  // Document label: caller's explicit value wins; absent that, use the
  // template's default label so the cover/header reads correctly for the
  // chosen template (e.g. ARTICLE REPORT instead of CUSTOMER CASE STUDY).
  const documentLabel = config?.documentLabel ?? templateDef.documentLabel;

  return {
    templateId,
    documentLabel,
    targetLength,
    preferredPages,
    maxPages,
    coverDensity,
    narrativeMode,
    supportingVisualPolicy,
    reviewRequired: intake.risks.length > 0,
  };
}
