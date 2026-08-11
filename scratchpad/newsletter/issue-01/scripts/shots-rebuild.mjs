/*
 * Newsletter issue 01 — rebuild screenshots (02, 03, 04, 05, 06).
 *
 * Drives the REAL app: vite dev on :5179 against the real Fastify backend on
 * :8788, with a real durable run produced by the real extraction agent. No API
 * interception, no mock UI. Screenshot support only — nothing here is imported
 * by the application.
 *
 *   node shots-rebuild.mjs <step>
 *     step ∈ intake | draft | waive | weak | decide | gate | approve | artifact
 */
import { readFileSync } from "node:fs";

const ROOT = "/Users/sheen/Repos/content-to-pdf";
const HERE = new URL(".", import.meta.url).pathname;
const OUT = `${HERE}..`;
const BASE = "http://localhost:5179";
const RAW = readFileSync(`${HERE}../fixtures/source-brightwater.md`, "utf8");
const REVIEWER = "Dana Whitlock";
const RUN_NAME = "brightwater-fieldsync-notes.md";

const step = process.argv[2];

const pw = await import(`file://${ROOT}/backend/node_modules/playwright/index.js`);
const { chromium } = pw.chromium ? pw : pw.default;

// Full Chromium, not the headless shell: the shell ships no PDF viewer, so the
// approval workspace's iframe would screenshot blank.
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const page = await context.newPage();

async function shot(name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}.png`);
}

async function openRun() {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#rail-reviewer").fill(REVIEWER);
  await page.getByRole("button", { name: `Open run ${RUN_NAME}` }).click();
  await page.waitForTimeout(900);
}

/** Waive one open blocking finding through the real UI controls. */
async function waive(match, reason) {
  const trigger = page.getByRole("button", { name: new RegExp(`^Waive issue: ${match}`) });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.getByLabel(/reason for waiving/i).fill(reason);
  await page.getByRole("button", { name: "Waive this issue", exact: true }).click();
  await page.getByRole("button", { name: "Confirm waive" }).click();
  await page.waitForTimeout(1400);
}

/** Replace the Results bullets in the editable draft, then save. */
async function setResults(bullets) {
  const results = page
    .locator("section")
    // .last() is the innermost match — the outer "Page 1 summary" section contains
    // the Results heading too.
    .filter({ has: page.getByRole("heading", { name: "Results", exact: true }) })
    .last();
  await results.scrollIntoViewIfNeeded();
  // Empty the list, then add the bullets we want.
  let removes = await results.getByRole("button", { name: "Remove item" }).count();
  while (removes > 0) {
    await results.getByRole("button", { name: "Remove item" }).last().click();
    removes -= 1;
  }
  for (const [i, text] of bullets.entries()) {
    await results.getByRole("button", { name: "+ Add" }).click();
    await results.locator("textarea").nth(i).fill(text);
  }
  await page.getByRole("button", { name: "Save content" }).click();
  await page.waitForTimeout(1600);
}

// ---------------------------------------------------------------------------

/** Fill the Create screen's brand block with the same brand the run carries. */
async function setBrand() {
  const group = page.locator("details.config-group").filter({ hasText: "Brand and assets" });
  await group.locator("summary").click();
  await group.getByLabel("Brand Name").fill("Brightwater Facilities Group");
  await group.getByLabel("Website").fill("www.brightwater-fm.example");
  await group.getByLabel("Copyright").fill("© 2026 Brightwater Facilities Group. All rights reserved.");
  const hex = (label, value) =>
    group.locator("label").filter({ hasText: label }).locator("input[type='text']").fill(value);
  await hex("Primary", "#1E3A34");
  await hex("Accent", "#C2703D");
  await group.locator("input[type='file']").first().setInputFiles(`${HERE}../fixtures/brightwater-logo.svg`);
  await page.waitForTimeout(400);
  await group.locator("summary").click();
}

if (step === "intake") {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#rail-reviewer").fill(REVIEWER);
  await page.getByRole("button", { name: "Create" }).click();
  await setBrand();
  const paste = page.getByLabel(/source content/i);
  await paste.fill(RAW);
  // fill() leaves the caret at the end, which scrolls the source out of view.
  await paste.evaluate((el) => {
    el.scrollTop = 0;
    el.blur();
  });
  const y = Number(process.argv[3] ?? 0);
  await page.locator(".intake-scroll").evaluate((el, v) => (el.scrollTop = v), y);
  await shot("02-rebuild-create-intake");
}

if (step === "draft") {
  await openRun();
  const scroll = Number(process.argv[3] ?? 0);
  await page.locator(".canvas-scroll").evaluate((el, y) => (el.scrollTop = y), scroll);
  await shot("03-structured-draft-review");
}

if (step === "waive") {
  await openRun();
  await waive("Added industry context", "Standard framing of an acquisition-driven data problem; checked against the migration notes and it does not add a claim about Brightwater beyond the source.");
  await waive("Elaborated on the mechanisms", "Mobile dispatch and the site-manager portal are both named in the deployment scope, so the elaboration is accurate.");
  console.log("✓ two source_expansion findings waived");
}

if (step === "weak") {
  await openRun();
  await setResults(["No measured results yet"]);
  console.log("✓ Results reduced to the one claim the source supports");
}

if (step === "decide") {
  await openRun();
  const y = Number(process.argv[4] ?? 0);
  await page.locator(".canvas-scroll").evaluate((el, v) => (el.scrollTop = v), y);
  const card = page.locator(".decision-card").first();
  await card.scrollIntoViewIfNeeded();
  if (process.argv[3] === "open") {
    await card.getByRole("button", { name: /^Waive issue:/ }).click();
    await page.waitForTimeout(400);
    await card.scrollIntoViewIfNeeded();
  }
  await shot(process.argv[3] === "open" ? "04-missing-results-decision-open" : "04-missing-results-decision");
}

if (step === "gate") {
  await openRun();
  // What the source actually supports: the agent's "eradicated" claim becomes the
  // operations director's report, and the unmeasured benefit is left unclaimed.
  await setResults([
    "Planned and reactive in one view",
    "Reported: duplicates stopped",
    "40% of subcontractors live",
    "Invoicing no longer rekeyed",
  ]);
  const gate = page.getByText("Before you approve review").first();
  await gate.scrollIntoViewIfNeeded();
  await shot("06-version-bound-approval");
}

if (step === "approve") {
  await openRun();
  await page.getByRole("button", { name: "Approve review", exact: true }).click();
  await page.getByRole("button", { name: "Confirm approve review" }).click();
  await page.waitForTimeout(2000);
  console.log("✓ review gate approved — render stage queued");
}

if (step === "request-changes") {
  await openRun();
  await page.getByRole("button", { name: "Request changes", exact: true }).click();
  await page
    .getByLabel(/what needs to change/i)
    .fill("Cover is rendering the placeholder hero. Add the brand hero image and logo, then re-render before sign-off.");
  await page.getByRole("button", { name: "Request changes", exact: true }).click();
  await page.getByRole("button", { name: "Confirm request changes" }).click();
  await page.waitForTimeout(1600);
  console.log("✓ changes requested — run back at the review gate");
}

if (step === "artifact") {
  await openRun();
  // The embedded PDF viewer needs time to paint its first page.
  await page.waitForTimeout(5000);
  if (process.argv[3] === "collapse") {
    // Chromium's own viewer control — collapses the thumbnail rail, exactly as a
    // reviewer would. Clicked by position because the viewer is a plugin, not DOM.
    await page.mouse.click(Number(process.argv[4] ?? 542), Number(process.argv[5] ?? 238));
    await page.waitForTimeout(2500);
  }
  await shot("05-final-artifact-approval");
}

await browser.close();
