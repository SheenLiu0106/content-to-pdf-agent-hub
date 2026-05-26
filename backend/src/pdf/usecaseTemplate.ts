import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UseCase, PdfRenderConfig } from "../shared/useCaseSchema.js";
import type { SupportingVisualResolved } from "./renderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, "..", "templates", "usecase");

interface TemplateBundle {
  html: string;
  styles: string;
  placeholderHeroDataUri: string;
}

let cached: TemplateBundle | null = null;

function loadBundle(): TemplateBundle {
  if (cached) return cached;
  const html = fs.readFileSync(path.join(TEMPLATE_DIR, "template.html"), "utf8");
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
  const svg = fs.readFileSync(path.join(TEMPLATE_DIR, "placeholder-hero.svg"), "utf8");
  const placeholderHeroDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  cached = { html, styles, placeholderHeroDataUri };
  return cached;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

function bullets(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function nonEmpty<T>(arr: T[] | null | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

function buildHeroBlock(config: PdfRenderConfig, placeholder: string): string {
  const src = config.heroImageDataUrl ?? placeholder;
  return `<img src="${src}" alt="" />`;
}

function buildBrandHeader(config: PdfRenderConfig): string {
  if (config.logoDataUrl) {
    return `<img src="${config.logoDataUrl}" alt="${escapeHtml(config.brandName)}" />`;
  }
  return `<span>${escapeHtml(config.brandName)}</span>`;
}

function buildMetaRow(content: UseCase): string {
  const parts: string[] = [];
  if (content.solutionName) {
    parts.push(
      `<span><span class="meta-label">Solution:</span>${escapeHtml(content.solutionName)}</span>`
    );
  }
  if (content.industry) {
    parts.push(
      `<span><span class="meta-label">Industry:</span>${escapeHtml(content.industry)}</span>`
    );
  }
  if (content.useCaseFocus) {
    parts.push(
      `<span><span class="meta-label">Use Case Focus:</span>${escapeHtml(content.useCaseFocus)}</span>`
    );
  }
  if (parts.length === 0) return "";
  return `<div class="meta-row">${parts.join("")}</div>`;
}

const SUMMARY_BULLETS_PAGE_1 = 3;

function buildSummaryCard(label: string, items: string[], cardClass: string): string {
  if (!nonEmpty(items)) return "";
  const trimmed = items.slice(0, SUMMARY_BULLETS_PAGE_1);
  return `<div class="summary-section ${cardClass}"><h3>${escapeHtml(label)}</h3>${bullets(trimmed)}</div>`;
}

function normalizeWebsite(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function buildWebsiteOverlay(config: PdfRenderConfig): string {
  const site = normalizeWebsite(config.brandWebsite);
  if (!site) return "";
  return `<div class="hero-website-overlay">${escapeHtml(site)}</div>`;
}

function buildExecSummary(text: string): string {
  if (!text || !text.trim()) return "";
  return `<section class="exec-summary"><h2>Executive Summary</h2>${paragraphs(text)}</section>`;
}

function buildNarrativeBlock(content: UseCase): string {
  if (!nonEmpty(content.narrativeSections)) return "";
  return content.narrativeSections
    .map(
      (s) =>
        `<section class="narrative-section"><h2>${escapeHtml(s.heading)}</h2>${paragraphs(s.body)}</section>`
    )
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
  // Image path — uploaded supporting image takes precedence over mermaid.
  if (supporting.imageDataUrl) {
    const caption = (supporting.caption ?? "").trim() || "Operational Impact Pathway";
    return (
      `<section class="supporting-visual">` +
      `<div class="visual-title">${escapeHtml(caption)}</div>` +
      `<div class="visual-image"><img src="${supporting.imageDataUrl}" alt="${escapeHtml(caption)}" /></div>` +
      `</section>`
    );
  }

  // Mermaid path — only when SVG actually rendered. Title + description from content.
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

  // No image, no rendered SVG — omit the block entirely. No heading, no description,
  // no placeholder, no fallback box. This keeps the footer from being pushed onto
  // a near-empty page when the diagram fails to render.
  return "";
}

function buildCtaBlock(cta: string | null): string {
  if (!cta || !cta.trim()) return "";
  return `<section class="cta"><span class="cta-label">Call to Action</span>${escapeHtml(cta)}</section>`;
}

function buildSubtitleBlock(subtitle: string | null): string {
  if (!subtitle || !subtitle.trim()) return "";
  return `<p class="subtitle">${escapeHtml(subtitle)}</p>`;
}

function buildCopyrightBlock(config: PdfRenderConfig): string {
  const copyright = (config.brandCopyright ?? "").trim();
  const site = normalizeWebsite(config.brandWebsite);
  const finalCopyright = copyright || "© 2026 Your Company. All rights reserved.";
  const line = site
    ? `${escapeHtml(site)} · ${escapeHtml(finalCopyright)}`
    : escapeHtml(finalCopyright);
  return `<div class="document-copyright">${line}</div>`;
}

// Compact header that sits at the top of every page after the cover.
// Brand / document label on the left, the document title on the right
// (CSS truncates with ellipsis if long). Never rendered on page 1, since
// the cover hero is full-bleed at the top of that page.
function buildContentPageHeader(content: UseCase, config: PdfRenderConfig): string {
  const brand = (config.brandName ?? "").trim() || "Your Company";
  const label = (config.documentLabel ?? "").trim() || "CUSTOMER CASE STUDY";
  const title = (content.title ?? "").trim() || "Untitled use case";
  return (
    `<header class="content-page-header">` +
    `<div class="content-page-header-brand">${escapeHtml(brand)} / ${escapeHtml(label)}</div>` +
    `<div class="content-page-header-title">${escapeHtml(title)}</div>` +
    `</header>`
  );
}

// Small technical footer rendered on every page via Chromium's
// `footerTemplate`. Left: file name (ellipsis-truncated if long). Right:
// page X / Y. Subtle gray, single line — purely for navigation/identity,
// not a branded footer. The copyright line is a separate, one-time block
// rendered at the end of the document content (see `buildCopyrightBlock`).
export function buildFooterTemplate(filename: string): string {
  const safe = escapeHtml(filename);
  return (
    `<div style="` +
    `width:100%;padding:0 0.45in;box-sizing:border-box;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#94a3b8;` +
    `display:flex;justify-content:space-between;align-items:center;` +
    `-webkit-print-color-adjust:exact;">` +
    `<span style="max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safe}</span>` +
    `<span style="white-space:nowrap;">` +
    `<span class="pageNumber"></span> / <span class="totalPages"></span>` +
    `</span>` +
    `</div>`
  );
}

export function renderUseCaseTemplate(
  content: UseCase,
  config: PdfRenderConfig,
  supporting: SupportingVisualResolved
): string {
  const { html, styles, placeholderHeroDataUri } = loadBundle();

  const contentHeader = buildContentPageHeader(content, config);
  const supportingVisualHtml = buildSupportingVisualBlock(content, supporting);
  const hasSupportingVisualPage = supportingVisualHtml.length > 0;
  const copyrightBlock = buildCopyrightBlock(config);

  // Copyright appears once, after the final block of meaningful content.
  // If a supporting-visual page exists, the copyright sits at the end of
  // that page; otherwise it closes the narrative page.
  const narrativeCopyrightBlock = hasSupportingVisualPage ? "" : copyrightBlock;
  const supportingVisualPageBlock = hasSupportingVisualPage
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

    title: escapeHtml(content.title || "Untitled use case"),
    subtitleBlock: buildSubtitleBlock(content.subtitle),

    brandHeader: buildBrandHeader(config),
    documentLabel: escapeHtml(config.documentLabel || "CUSTOMER CASE STUDY"),

    heroBlock: buildHeroBlock(config, placeholderHeroDataUri),
    websiteOverlay: buildWebsiteOverlay(config),

    metaRow: buildMetaRow(content),

    goalsBlock: buildSummaryCard("Goals", content.goals, "card-goals"),
    challengesBlock: buildSummaryCard("Challenges", content.challenges, "card-challenges"),
    solutionsBlock: buildSummaryCard("Solutions", content.solutions, "card-solutions"),
    resultsBlock: buildSummaryCard("Results", content.results, "card-results"),

    contentHeader,

    executiveSummaryBlock: buildExecSummary(content.executiveSummary),
    narrativeBlock: buildNarrativeBlock(content),
    pullQuoteBlock: buildPullQuoteBlock(content),
    ctaBlock: buildCtaBlock(content.callToAction),
    narrativeCopyrightBlock,

    supportingVisualPageBlock,
  };

  return html.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key]! : ""
  );
}
