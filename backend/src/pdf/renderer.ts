import { chromium, type Browser } from "playwright";
import { renderTemplate } from "./template.js";
import type { Content } from "../shared/schema.js";

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

export async function renderPdf(content: Content, templateId = "branded-report"): Promise<Buffer> {
  const html = renderTemplate(templateId, content);

  await acquireSlot();
  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    releaseSlot();
    throw err;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.75in", right: "0.75in", bottom: "0.75in", left: "0.75in" },
    });
    return pdf;
  } finally {
    await page.close();
    await context.close();
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
