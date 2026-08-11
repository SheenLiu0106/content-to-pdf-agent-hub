/*
 * Newsletter issue 01 — screenshot 01, the original working product.
 *
 * Runs against the ORIGINAL stack served from a separate git worktree at commit
 * 4ce7aa6 (frontend :5173, backend :8788, real Gemini extraction). Nothing in the
 * current branch is used except this script and the shared source fixture.
 *
 *   node shots-original.mjs [step]   step ∈ extract (default) | shot
 */
import { readFileSync } from "node:fs";

const ROOT = "/Users/sheen/Repos/content-to-pdf";
const HERE = new URL(".", import.meta.url).pathname;
const OUT = `${HERE}..`;
const BASE = "http://localhost:5173";
const RAW = readFileSync(`${HERE}../fixtures/source-brightwater.md`, "utf8");

const pw = await import(`file://${ROOT}/backend/node_modules/playwright/index.js`);
const { chromium } = pw.chromium ? pw : pw.default;

const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const page = await context.newPage();

await page.goto(BASE, { waitUntil: "networkidle" });

// Same brand as the rebuilt run, so the two versions differ only where they
// really differ. All of these are the original UI's own controls.
await page.getByLabel("Brand Name").fill("Brightwater Facilities Group");
await page.getByLabel("Website").fill("www.brightwater-fm.example");
await page
  .getByLabel("Copyright")
  .fill("© 2026 Brightwater Facilities Group. All rights reserved.");
const hex = (label, value) =>
  page.locator("label").filter({ hasText: label }).locator("input[type='text']").fill(value);
await hex("Primary", "#1E3A34");
await hex("Accent", "#C2703D");
await page.locator("input[type='file']").first().setInputFiles(`${HERE}../fixtures/brightwater-logo.svg`);

await page.locator("textarea").first().fill(RAW);
await page.locator("textarea").first().evaluate((el) => {
  el.scrollTop = 0;
  el.blur();
});
await page.getByRole("button", { name: /extract content/i }).click();

// One /api/extract request runs the whole agent pipeline; it can take a minute.
await page.getByText("Review and edit").waitFor({ timeout: 180_000 });
await page.waitForTimeout(1500);

const y = Number(process.argv[2] ?? 0);
await page.evaluate((v) => window.scrollTo(0, v), y);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/01-original-working-version.png` });
console.log("✓ 01-original-working-version.png");

await browser.close();
