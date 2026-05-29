import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UseCase, PdfRenderConfig } from "../shared/useCaseSchema.js";
import type { SupportingVisualResolved } from "./renderer.js";
import { decideVisualPlacement } from "./usecaseTemplate.js";
import {
  applyTemplate,
  buildContentPageHeader,
  buildCopyrightBlock,
  bullets,
  escapeHtml,
  loadTemplateBundle,
  nonEmpty,
  paragraphs,
} from "./templateUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, "..", "templates", "executive_memo");

function buildBrandHeader(config: PdfRenderConfig): string {
  if (config.logoDataUrl) {
    return `<img src="${config.logoDataUrl}" alt="${escapeHtml(config.brandName)}" />`;
  }
  return `<span>${escapeHtml(config.brandName)}</span>`;
}

function buildExecSummaryBlock(content: UseCase): string {
  if (!content.executiveSummary || !content.executiveSummary.trim()) return "";
  return (
    `<section class="memo-block memo-exec-summary">` +
    `<h2>Executive Summary</h2>` +
    paragraphs(content.executiveSummary) +
    `</section>`
  );
}

// Recommendation prefers an explicit callToAction; falls back to the first
// extracted result. Returns both the rendered block and a flag telling the
// Next Steps block whether to skip results[0] (avoid duplicating it).
interface RecommendationResult {
  block: string;
  consumedFirstResult: boolean;
}

function buildRecommendationBlock(content: UseCase): RecommendationResult {
  const cta = (content.callToAction ?? "").trim();
  if (cta) {
    return {
      block:
        `<section class="memo-block memo-recommendation">` +
        `<h2>Recommendation</h2>` +
        paragraphs(cta) +
        `</section>`,
      consumedFirstResult: false,
    };
  }
  const first = content.results[0]?.trim();
  if (first) {
    return {
      block:
        `<section class="memo-block memo-recommendation">` +
        `<h2>Recommendation</h2>` +
        `<p>${escapeHtml(first)}</p>` +
        `</section>`,
      consumedFirstResult: true,
    };
  }
  return { block: "", consumedFirstResult: false };
}

// Key Points list — prefer solutions (the "what we're proposing"), fall
// back to goals. Cap at 6 so the cover stays focused.
function buildKeyPointsBlock(content: UseCase): string {
  const source = nonEmpty(content.solutions)
    ? content.solutions
    : nonEmpty(content.goals)
      ? content.goals
      : [];
  const items = source.slice(0, 6);
  if (items.length === 0) return "";
  return (
    `<section class="memo-block">` +
    `<h2>Key Points</h2>` +
    `<ul class="memo-key-points">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` +
    `</section>`
  );
}

function buildBackgroundBlock(content: UseCase): string {
  const first = content.narrativeSections[0];
  if (!first) return "";
  return (
    `<section class="memo-section">` +
    `<h2>Background</h2>` +
    paragraphs(first.body) +
    `</section>`
  );
}

function buildAnalysisBlock(content: UseCase): string {
  const rest = content.narrativeSections.slice(1);
  if (rest.length === 0) return "";
  // Render the first remaining section under an "Analysis" heading and
  // append any further sections using their own headings — keeps long
  // memos readable without flattening structure.
  const [head, ...tail] = rest;
  const headHtml =
    `<section class="memo-section">` +
    `<h2>Analysis</h2>` +
    paragraphs(head!.body) +
    `</section>`;
  const tailHtml = tail
    .map(
      (s) =>
        `<section class="memo-section"><h2>${escapeHtml(s.heading)}</h2>${paragraphs(s.body)}</section>`
    )
    .join("\n");
  return headHtml + tailHtml;
}

function buildRisksBlock(content: UseCase): string {
  if (!nonEmpty(content.challenges)) return "";
  return (
    `<section class="memo-section memo-risks">` +
    `<h2>Risks &amp; Considerations</h2>` +
    bullets(content.challenges) +
    `</section>`
  );
}

function buildNextStepsBlock(content: UseCase, skipFirst: boolean): string {
  const items = skipFirst ? content.results.slice(1) : content.results;
  if (items.length === 0) return "";
  return (
    `<section class="memo-section memo-next-steps">` +
    `<h2>Next Steps</h2>` +
    bullets(items) +
    `</section>`
  );
}

function buildSupportingVisualBlock(
  content: UseCase,
  supporting: SupportingVisualResolved
): string {
  if (supporting.imageDataUrl) {
    const caption = (supporting.caption ?? "").trim() || "Supporting Visual";
    return (
      `<section class="supporting-visual">` +
      `<div class="visual-title">${escapeHtml(caption)}</div>` +
      `<div class="visual-image"><img src="${supporting.imageDataUrl}" alt="${escapeHtml(caption)}" /></div>` +
      `</section>`
    );
  }
  if (supporting.mermaidSvg && content.mermaidDiagram) {
    const { title, description } = content.mermaidDiagram;
    const titleHtml = title
      ? `<div class="visual-title">${escapeHtml(title)}</div>`
      : "";
    const descHtml = description
      ? `<div class="visual-desc">${escapeHtml(description)}</div>`
      : "";
    return (
      `<section class="supporting-visual">` +
      titleHtml +
      `<div class="visual-svg">${supporting.mermaidSvg}</div>` +
      descHtml +
      `</section>`
    );
  }
  return "";
}

export function renderExecutiveMemoTemplate(
  content: UseCase,
  config: PdfRenderConfig,
  supporting: SupportingVisualResolved
): string {
  const { html, styles } = loadTemplateBundle(TEMPLATE_DIR);

  // Hero image upload remains visible in the UI but the memo deliberately
  // ignores it — memos are text-forward. Supporting visual (Mermaid /
  // uploaded image) is allowed because it's an editorial choice in the
  // right rail, separate from the cover hero.
  const placement = decideVisualPlacement(
    content,
    supporting,
    config.pdfLengthMode,
    "normal"
  );
  const supportingVisualHtml =
    placement === "omit" ? "" : buildSupportingVisualBlock(content, supporting);
  const dedicatedPage = placement === "dedicated-page-3";
  const inlineVisualBlock = placement === "inline-page-2" ? supportingVisualHtml : "";

  const copyrightBlock = buildCopyrightBlock(config);
  const narrativeCopyrightBlock = dedicatedPage ? "" : copyrightBlock;

  const contentHeader = buildContentPageHeader(content, config);
  const supportingVisualPageBlock = dedicatedPage
    ? `<section class="content-page supporting-visual-page">` +
      contentHeader +
      `<div class="content-page-body">` +
      supportingVisualHtml +
      copyrightBlock +
      `</div></section>`
    : "";

  const recommendation = buildRecommendationBlock(content);

  const replacements: Record<string, string> = {
    styles,
    primaryColor: config.primaryColor,
    accentColor: config.accentColor,

    title: escapeHtml(content.title || "Untitled"),
    brandHeader: buildBrandHeader(config),
    documentLabel: escapeHtml(config.documentLabel || "EXECUTIVE MEMO"),

    execSummaryBlock: buildExecSummaryBlock(content),
    recommendationBlock: recommendation.block,
    keyPointsBlock: buildKeyPointsBlock(content),

    contentHeader,
    backgroundBlock: buildBackgroundBlock(content),
    analysisBlock: buildAnalysisBlock(content),
    risksBlock: buildRisksBlock(content),
    nextStepsBlock: buildNextStepsBlock(content, recommendation.consumedFirstResult),
    inlineVisualBlock,
    narrativeCopyrightBlock,
    supportingVisualPageBlock,
  };

  return applyTemplate(html, replacements);
}
