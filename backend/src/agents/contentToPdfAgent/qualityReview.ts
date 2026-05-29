import type { UseCase, PdfRenderConfig } from "../../shared/useCaseSchema.js";
import type {
  LayoutPlan,
  PdfQualityReport,
  QualityIssue,
} from "../../shared/agentTypes.js";
import { isSentenceFragment } from "./contentEditor.js";

// Level-1 deterministic quality review. Pre-render checks against the
// normalized UseCase + LayoutPlan. No PDF parsing, no LLM. The Repair stage
// consumes the issue codes and decides what to do; Quality Review only
// emits findings.

const SUMMARY_SPARSE_CHARS = 380;
const SUMMARY_OVERFLOW_CHARS = 850;
const VISUAL_WEIGHT_SPARSE_THRESHOLD = 600;

function totalSummaryChars(content: UseCase): number {
  return (
    [...content.goals, ...content.challenges, ...content.solutions, ...content.results]
      .reduce((acc, b) => acc + b.length, 0)
  );
}

function totalBulletCount(content: UseCase): number {
  return (
    content.goals.length +
    content.challenges.length +
    content.solutions.length +
    content.results.length
  );
}

function hasAtMostOneBulletInAnySection(content: UseCase): boolean {
  return [content.goals, content.challenges, content.solutions, content.results].some(
    (arr) => arr.length <= 1
  );
}

function visualWeight(content: UseCase, config: PdfRenderConfig): number {
  const hasImage = !!config.supportingImageDataUrl;
  const hasVerifiedMermaid =
    config.mermaidVerified && !!content.mermaidDiagram?.code;
  return (
    (hasImage ? 1200 : 0) +
    (hasVerifiedMermaid ? 900 : 0) +
    (content.mermaidDiagram?.description?.length ?? 0)
  );
}

function checkDanglingSentences(content: UseCase, issues: QualityIssue[]): void {
  if (isSentenceFragment(content.executiveSummary)) {
    issues.push({
      code: "dangling_sentence",
      severity: "warning",
      message: "Executive summary ends on an incomplete sentence.",
      location: "summary",
    });
  }
  for (const section of content.narrativeSections) {
    if (isSentenceFragment(section.body)) {
      issues.push({
        code: "dangling_sentence",
        severity: "warning",
        message: `Narrative section "${section.heading}" ends on an incomplete sentence.`,
        location: "narrative",
      });
    }
  }
}

function checkCoverLayout(
  content: UseCase,
  layoutPlan: LayoutPlan,
  issues: QualityIssue[]
): void {
  const summaryChars = totalSummaryChars(content);

  if (
    layoutPlan.coverDensity === "spacious" &&
    summaryChars < SUMMARY_SPARSE_CHARS &&
    hasAtMostOneBulletInAnySection(content)
  ) {
    issues.push({
      code: "short_cover_blank_space",
      severity: "warning",
      message:
        "Page 1 may feel sparse — summary content is light and at least one section has 0–1 bullets.",
      location: "page1",
    });
  }

  if (
    summaryChars > SUMMARY_OVERFLOW_CHARS &&
    layoutPlan.coverDensity !== "compact"
  ) {
    issues.push({
      code: "summary_spill",
      severity: "warning",
      message: "Summary content is dense — page 1 may overflow without compact density.",
      location: "page1",
    });
  }

  if (totalBulletCount(content) === 0) {
    issues.push({
      code: "short_cover_blank_space",
      severity: "error",
      message: "No summary bullets extracted — page 1 will render without Goals/Challenges/Solutions/Results.",
      location: "page1",
    });
  }
}

function checkVisualPlacement(
  content: UseCase,
  config: PdfRenderConfig,
  layoutPlan: LayoutPlan,
  issues: QualityIssue[]
): void {
  const weight = visualWeight(content, config);

  if (layoutPlan.visualPlacement === "dedicated" && weight < VISUAL_WEIGHT_SPARSE_THRESHOLD) {
    issues.push({
      code: "sparse_page",
      severity: "warning",
      message: "Supporting visual is light — its dedicated page may look empty.",
      location: "page3",
    });
  }

  // Failed visual: user enabled mermaid, but it isn't verified, and no
  // uploaded image is set as fallback.
  const wantsMermaid =
    config.supportingVisualEnabled && config.supportingVisualType === "mermaid";
  if (
    wantsMermaid &&
    !config.mermaidVerified &&
    !config.supportingImageDataUrl
  ) {
    issues.push({
      code: "failed_visual",
      severity: "warning",
      message:
        "Supporting Mermaid diagram is not verified — it will be omitted from the PDF.",
      location: "page2",
    });
  }
}

function checkBrand(config: PdfRenderConfig, issues: QualityIssue[]): void {
  if (!config.brandWebsite || !config.brandWebsite.trim()) {
    issues.push({
      code: "missing_footer",
      severity: "warning",
      message: "Brand website is blank — the footer line will only show the copyright.",
    });
  }
  if (!config.brandCopyright || !config.brandCopyright.trim()) {
    issues.push({
      code: "copyright_error",
      severity: "warning",
      message: "Brand copyright is blank — a generic default will be used.",
    });
  }
}

function checkFilename(content: UseCase, issues: QualityIssue[]): void {
  const slug = content.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    issues.push({
      code: "filename_error",
      severity: "warning",
      message: "Title slugifies to empty — generated filename will use a fallback.",
    });
  }
}

// Issue codes the repair loop can act on. Other codes (missing_footer,
// copyright_error, filename_error) are surfaced as warnings to the user but
// don't trigger repair attempts because they reflect user-owned config.
const AUTO_REPAIRABLE: ReadonlySet<QualityIssue["code"]> = new Set([
  "dangling_sentence",
  "short_cover_blank_space",
  "summary_spill",
  "sparse_page",
  "failed_visual",
]);

export function runQualityReview(
  content: UseCase,
  config: PdfRenderConfig,
  layoutPlan: LayoutPlan
): PdfQualityReport {
  const issues: QualityIssue[] = [];

  checkDanglingSentences(content, issues);
  checkCoverLayout(content, layoutPlan, issues);
  checkVisualPlacement(content, config, layoutPlan, issues);
  checkBrand(config, issues);
  checkFilename(content, issues);

  // passed = nothing for the repair loop to act on. User-config warnings
  // (missing footer, copyright, filename) are surfaced but don't block.
  const hasRepairable = issues.some((i) => AUTO_REPAIRABLE.has(i.code));
  const hasError = issues.some((i) => i.severity === "error");

  return {
    passed: !hasRepairable && !hasError,
    issues,
  };
}
