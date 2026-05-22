import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_TYPE_LABELS, type Content } from "../shared/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "..", "templates");

interface TemplateBundle {
  html: string;
  styles: string;
  logoDataUri: string;
}

const cache = new Map<string, TemplateBundle>();

function loadTemplate(templateId: string): TemplateBundle {
  const hit = cache.get(templateId);
  if (hit) return hit;

  const dir = path.join(TEMPLATES_DIR, templateId);
  if (!fs.existsSync(dir)) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const html = fs.readFileSync(path.join(dir, "template.html"), "utf8");
  const styles = fs.readFileSync(path.join(dir, "styles.css"), "utf8");
  const logoSvg = fs.readFileSync(path.join(dir, "logo.svg"), "utf8");
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

  const bundle = { html, styles, logoDataUri };
  cache.set(templateId, bundle);
  return bundle;
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

function bulletList(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function buildMetaRow(content: Content): string {
  const parts: string[] = [];
  if (content.authorOrSource) {
    parts.push(`<span><span class="label">Source:</span>${escapeHtml(content.authorOrSource)}</span>`);
  }
  if (content.audience) {
    parts.push(`<span><span class="label">Audience:</span>${escapeHtml(content.audience)}</span>`);
  }
  if (parts.length === 0) return "";
  return `<div class="meta-row">${parts.join("")}</div>`;
}

function nonEmpty<T>(arr: T[] | null | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

export function renderTemplate(templateId: string, content: Content): string {
  const { html, styles, logoDataUri } = loadTemplate(templateId);

  const replacements: Record<string, string> = {
    title: escapeHtml(content.title || "Untitled"),
    contentTypeLabel: escapeHtml(CONTENT_TYPE_LABELS[content.contentType] ?? content.contentType),
    executiveSummary: escapeHtml(content.executiveSummary || ""),
    generatedDate: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    styles,
    logoDataUri,
    metaRow: buildMetaRow(content),
    keyPointsBlock: nonEmpty(content.keyPoints)
      ? `<section><h2>Key Points</h2>${bulletList(content.keyPoints)}</section>`
      : "",
    backgroundBlock: content.background
      ? `<section><h2>Background</h2>${paragraphs(content.background)}</section>`
      : "",
    mainSectionsBlock: nonEmpty(content.mainContentSections)
      ? `<section><h2>Main Content</h2>${content.mainContentSections
          .map(
            (s) => `<h3>${escapeHtml(s.heading)}</h3>${paragraphs(s.body)}`
          )
          .join("")}</section>`
      : "",
    recommendationsBlock: nonEmpty(content.recommendations)
      ? `<section><h2>Recommendations</h2>${bulletList(content.recommendations)}</section>`
      : "",
    nextStepsBlock: nonEmpty(content.nextSteps)
      ? `<section><h2>Next Steps</h2>${bulletList(content.nextSteps)}</section>`
      : "",
    evidenceBlock: nonEmpty(content.supportingEvidence)
      ? `<section class="evidence"><h2>Supporting Evidence</h2>${bulletList(content.supportingEvidence)}</section>`
      : "",
    ctaBlock: content.callToAction
      ? `<section class="cta">${escapeHtml(content.callToAction)}</section>`
      : "",
  };

  return html.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key] : ""
  );
}
