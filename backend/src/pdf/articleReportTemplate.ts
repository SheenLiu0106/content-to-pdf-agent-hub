import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  InlineVisualBlock,
  UseCase,
  PdfRenderConfig,
} from "../shared/useCaseSchema.js";
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
const TEMPLATE_DIR = path.resolve(__dirname, "..", "templates", "article_report");
// Re-use the case study's placeholder hero — the article cover hero is the
// same flush-image visual, just shorter. Avoids shipping a duplicate asset.
const PLACEHOLDER_HERO_PATH = path.resolve(
  __dirname,
  "..",
  "templates",
  "usecase",
  "placeholder-hero.svg"
);
let placeholderHeroDataUri: string | null = null;

function getPlaceholderHero(): string {
  if (placeholderHeroDataUri) return placeholderHeroDataUri;
  const svg = fs.readFileSync(PLACEHOLDER_HERO_PATH, "utf8");
  placeholderHeroDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return placeholderHeroDataUri;
}

function buildHeroBlock(config: PdfRenderConfig): string {
  const src = config.heroImageDataUrl ?? getPlaceholderHero();
  return `<img src="${src}" alt="" />`;
}

function buildSubtitleBlock(subtitle: string | null): string {
  if (!subtitle || !subtitle.trim()) return "";
  return `<p class="subtitle">${escapeHtml(subtitle)}</p>`;
}

// Pick takeaways from results if present, else goals. Cap at 5 bullets so
// the card never dominates the cover.
function pickTakeaways(content: UseCase): string[] {
  const source = nonEmpty(content.results)
    ? content.results
    : nonEmpty(content.goals)
      ? content.goals
      : [];
  return source.slice(0, 5);
}

function buildKeyTakeawaysBlock(content: UseCase): string {
  const items = pickTakeaways(content);
  if (items.length === 0) return "";
  return (
    `<section class="article-takeaways">` +
    `<h3>Key Takeaways</h3>` +
    bullets(items) +
    `</section>`
  );
}

// Intro on page 1: render the executive summary as paragraphs styled with a
// looser leading. Omitted if there is no exec summary.
function buildIntroBlock(content: UseCase): string {
  if (!content.executiveSummary || !content.executiveSummary.trim()) return "";
  return `<section class="article-intro">${paragraphs(content.executiveSummary)}</section>`;
}

// Renderable = a real image with an embedded data URL (uploaded, pasted, or
// fetched from src at render time). Slots and failed visuals are filtered
// out here — they never reach the PDF, matching the "do not render failed
// placeholders" rule from the spec.
function isRenderable(v: InlineVisualBlock): boolean {
  if (v.kind !== "image") return false;
  if (v.status !== "ready") return false;
  return Boolean(v.dataUrl || v.src);
}

function groupRenderableVisualsBySection(
  visuals: InlineVisualBlock[] | undefined,
  sectionCount: number
): Map<number, InlineVisualBlock[]> {
  const out = new Map<number, InlineVisualBlock[]>();
  if (!visuals || sectionCount === 0) return out;
  for (const v of visuals) {
    if (!isRenderable(v)) continue;
    const idx =
      typeof v.sectionIndex === "number"
        ? Math.min(Math.max(0, v.sectionIndex), sectionCount - 1)
        : sectionCount - 1;
    const list = out.get(idx) ?? [];
    list.push(v);
    out.set(idx, list);
  }
  return out;
}

function renderInlineVisualHtml(v: InlineVisualBlock): string {
  const src = v.dataUrl ?? v.src;
  if (!src) return "";
  const altSource = v.altText ?? v.caption ?? "";
  const captionHtml = v.caption
    ? `<figcaption class="inline-visual-caption">${escapeHtml(v.caption)}</figcaption>`
    : "";
  return (
    `<figure class="inline-visual">` +
    `<img src="${src}" alt="${escapeHtml(altSource)}" />` +
    captionHtml +
    `</figure>`
  );
}

// Render a section body, injecting any "after_first_paragraph" visuals
// right after the first <p>. The body splitter mirrors templateUtils
// paragraphs() so behavior stays in lockstep — only the join changes.
function renderSectionBody(
  body: string,
  afterFirstParagraph: InlineVisualBlock[]
): string {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) {
    // No paragraphs — fall back to dumping the visuals at the section end.
    return afterFirstParagraph.map(renderInlineVisualHtml).join("");
  }
  const rendered = paras.map(
    (p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`
  );
  if (afterFirstParagraph.length === 0) return rendered.join("\n");
  const insertion = afterFirstParagraph.map(renderInlineVisualHtml).join("");
  return [rendered[0], insertion, ...rendered.slice(1)].join("\n");
}

// Article sections on page 2+. No fixed Goals/Challenges/Solutions/Results
// headings — we render whatever narrativeSections the agent extracted.
// Inline visuals (article-report-only) interleave per section based on
// each visual's `sectionIndex` and `placement`.
function buildArticleSectionsBlock(content: UseCase): string {
  if (!nonEmpty(content.narrativeSections)) return "";
  const bySection = groupRenderableVisualsBySection(
    content.inlineVisuals,
    content.narrativeSections.length
  );
  return content.narrativeSections
    .map((s, i) => {
      const sectionVisuals = bySection.get(i) ?? [];
      if (sectionVisuals.length === 0) {
        return `<section class="narrative-section"><h2>${escapeHtml(s.heading)}</h2>${paragraphs(s.body)}</section>`;
      }
      const afterFirstPara = sectionVisuals.filter(
        (v) => v.placement === "after_first_paragraph"
      );
      const afterSection = sectionVisuals.filter(
        (v) => v.placement !== "after_first_paragraph"
      );
      const bodyHtml = renderSectionBody(s.body, afterFirstPara);
      const trailingVisuals = afterSection.map(renderInlineVisualHtml).join("");
      return (
        `<section class="narrative-section">` +
        `<h2>${escapeHtml(s.heading)}</h2>` +
        bodyHtml +
        trailingVisuals +
        `</section>`
      );
    })
    .join("\n");
}

function buildPullQuoteBlock(content: UseCase): string {
  if (!nonEmpty(content.pullQuotes)) return "";
  return content.pullQuotes
    .map((q) => {
      const attribution = q.attribution
        ? `<span class="quote-attribution">— ${escapeHtml(q.attribution)}</span>`
        : "";
      return `<blockquote class="pull-quote">${escapeHtml(q.quote)}${attribution}</blockquote>`;
    })
    .join("\n");
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

// Decide page-1 density for the article cover. Article covers don't have
// the 4-card grid, so density is driven purely by title + takeaways length.
function computeArticleCoverDensity(content: UseCase): "compact" | "normal" | "spacious" {
  const titleLen = content.title.length;
  const subtitleLen = content.subtitle?.length ?? 0;
  const takeawaysLen = pickTakeaways(content).reduce(
    (acc, b) => acc + b.length,
    0
  );
  const introLen = content.executiveSummary.length;

  if (titleLen > 80 || subtitleLen > 110 || takeawaysLen > 450 || introLen > 700) {
    return "compact";
  }
  if (titleLen <= 55 && subtitleLen <= 70 && takeawaysLen <= 220 && introLen <= 280) {
    return "spacious";
  }
  return "normal";
}

export function renderArticleReportTemplate(
  content: UseCase,
  config: PdfRenderConfig,
  supporting: SupportingVisualResolved
): string {
  const { html, styles } = loadTemplateBundle(TEMPLATE_DIR);

  const density = computeArticleCoverDensity(content);
  const placement = decideVisualPlacement(content, supporting, config.pdfLengthMode, density);
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

  const replacements: Record<string, string> = {
    styles,
    primaryColor: config.primaryColor,
    accentColor: config.accentColor,

    coverClass: density,

    title: escapeHtml(content.title || "Untitled"),
    subtitleBlock: buildSubtitleBlock(content.subtitle),
    documentLabel: escapeHtml(config.documentLabel || "ARTICLE REPORT"),

    heroBlock: buildHeroBlock(config),

    keyTakeawaysBlock: buildKeyTakeawaysBlock(content),
    introBlock: buildIntroBlock(content),

    contentHeader,
    articleSectionsBlock: buildArticleSectionsBlock(content),
    pullQuoteBlock: buildPullQuoteBlock(content),
    inlineVisualBlock,
    narrativeCopyrightBlock,

    supportingVisualPageBlock,
  };

  return applyTemplate(html, replacements);
}
