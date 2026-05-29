// Small HTML helpers shared by the non-case-study templates. The case study
// (usecaseTemplate.ts) ships with its own inline copies of these; this
// module exists for the newer Article Report and Executive Memo renderers
// so they can share the same escaping and paragraph behavior without
// touching the production case-study path.

import fs from "node:fs";
import path from "node:path";
import type { UseCase, PdfRenderConfig } from "../shared/useCaseSchema.js";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export function bullets(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

export function nonEmpty<T>(arr: T[] | null | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

export function normalizeWebsite(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

export function buildCopyrightBlock(config: PdfRenderConfig): string {
  const copyright = (config.brandCopyright ?? "").trim();
  const site = normalizeWebsite(config.brandWebsite);
  const finalCopyright = copyright || "© 2026 Your Company. All rights reserved.";
  const line = site
    ? `${escapeHtml(site)} · ${escapeHtml(finalCopyright)}`
    : escapeHtml(finalCopyright);
  return `<div class="document-copyright">${line}</div>`;
}

// Compact header at the top of every page after the cover. Brand /
// document label on the left, document title on the right (truncated with
// ellipsis when long).
export function buildContentPageHeader(
  content: UseCase,
  config: PdfRenderConfig
): string {
  const brand = (config.brandName ?? "").trim() || "Your Company";
  const label = (config.documentLabel ?? "").trim() || "DOCUMENT";
  const title = (content.title ?? "").trim() || "Untitled";
  return (
    `<header class="content-page-header">` +
    `<div class="content-page-header-brand">${escapeHtml(brand)} / ${escapeHtml(label)}</div>` +
    `<div class="content-page-header-title">${escapeHtml(title)}</div>` +
    `</header>`
  );
}

export interface TemplateBundle {
  html: string;
  styles: string;
}

// Read a template directory's HTML + CSS once and cache by directory path.
// Mirrors the loadBundle pattern in usecaseTemplate.ts.
const bundleCache = new Map<string, TemplateBundle>();

export function loadTemplateBundle(templateDir: string): TemplateBundle {
  const cached = bundleCache.get(templateDir);
  if (cached) return cached;
  const html = fs.readFileSync(path.join(templateDir, "template.html"), "utf8");
  const styles = fs.readFileSync(path.join(templateDir, "styles.css"), "utf8");
  const bundle: TemplateBundle = { html, styles };
  bundleCache.set(templateDir, bundle);
  return bundle;
}

// Same template tag interpolation rule used in usecaseTemplate.ts: replace
// `{{key}}` with replacements[key] or empty string if missing.
export function applyTemplate(
  html: string,
  replacements: Record<string, string>
): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key]! : ""
  );
}
