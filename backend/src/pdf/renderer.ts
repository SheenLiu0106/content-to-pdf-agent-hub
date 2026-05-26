import { chromium, type Browser } from "playwright";
import { renderUseCaseTemplate, buildFooterTemplate } from "./usecaseTemplate.js";
import { renderMermaidToSvg } from "./mermaid.js";
import type { UseCase, PdfRenderConfig } from "../shared/useCaseSchema.js";

let browserPromise: Promise<Browser> | null = null;

const MAX_CONCURRENT = 3;
let inFlight = 0;
const queue: Array<() => void> = [];

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ args: ["--no-sandbox"] });
  }
  return browserPromise;
}

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  inFlight++;
}

function releaseSlot(): void {
  inFlight--;
  const next = queue.shift();
  if (next) next();
}

export interface SupportingVisualResolved {
  imageDataUrl: string | null;
  mermaidSvg: string;
  caption: string | null;
}

async function resolveSupportingVisual(
  content: UseCase,
  config: PdfRenderConfig,
  browser: Browser
): Promise<SupportingVisualResolved> {
  if (!config.supportingVisualEnabled || !config.supportingVisualType) {
    return { imageDataUrl: null, mermaidSvg: "", caption: null };
  }

  if (config.supportingVisualType === "image") {
    if (!config.supportingImageDataUrl) {
      return { imageDataUrl: null, mermaidSvg: "", caption: null };
    }
    return {
      imageDataUrl: config.supportingImageDataUrl,
      mermaidSvg: "",
      caption: config.supportingImageCaption,
    };
  }

  // Mermaid path — only attempt render if the user verified it in the UI.
  // If unverified, omit the whole supporting visual block (no title-only section).
  if (!config.mermaidVerified) {
    return { imageDataUrl: null, mermaidSvg: "", caption: null };
  }
  const code = content.mermaidDiagram?.code;
  if (!code) {
    return { imageDataUrl: null, mermaidSvg: "", caption: null };
  }
  try {
    const result = await renderMermaidToSvg(code, browser);
    if (result.fallback || !result.svg) {
      return { imageDataUrl: null, mermaidSvg: "", caption: null };
    }
    return { imageDataUrl: null, mermaidSvg: result.svg, caption: null };
  } catch {
    return { imageDataUrl: null, mermaidSvg: "", caption: null };
  }
}

export async function renderPdf(
  content: UseCase,
  config: PdfRenderConfig,
  opts: { filename?: string } = {}
): Promise<Buffer> {
  await acquireSlot();
  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    releaseSlot();
    throw err;
  }

  try {
    const supporting = await resolveSupportingVisual(content, config, browser);

    const html = renderUseCaseTemplate(content, config, supporting);

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });

      const footerLabel = opts.filename ?? content.title ?? "";
      const pdf = await page.pdf({
        format: "Letter",
        printBackground: true,
        // top/left/right = 0 so the cover hero is flush against the page
        // edges. bottom reserves a thin band for the small technical footer
        // (file name + page X / Y). No top header — nothing should overlay
        // the page 1 hero image.
        margin: { top: "0", right: "0", bottom: "0.35in", left: "0" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: buildFooterTemplate(footerLabel),
      });
      return pdf;
    } finally {
      await page.close();
      await context.close();
    }
  } finally {
    releaseSlot();
  }
}

export async function validateMermaid(
  code: string
): Promise<{ ok: boolean; svg: string }> {
  await acquireSlot();
  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    releaseSlot();
    throw err;
  }
  try {
    const result = await renderMermaidToSvg(code, browser);
    const ok = Boolean(result.svg) && !result.fallback;
    return { ok, svg: ok ? result.svg : "" };
  } catch {
    return { ok: false, svg: "" };
  } finally {
    releaseSlot();
  }
}

export async function shutdownRenderer(): Promise<void> {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // best-effort
  } finally {
    browserPromise = null;
  }
}
