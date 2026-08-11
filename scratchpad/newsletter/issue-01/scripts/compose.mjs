/*
 * Editorial comparison images. Nothing inside a screenshot is altered: each panel
 * is the raw PNG, optionally cropped by a rectangle in source pixels, placed side
 * by side with one small text label. No arrows, gradients or annotations.
 *
 *   node compose.mjs cover      -> cover-original-vs-rebuild.png
 *   node compose.mjs warning    -> comparison-warning-vs-decision.png
 */
import { readFileSync } from "node:fs";

const ROOT = "/Users/sheen/Repos/content-to-pdf";
const HERE = new URL(".", import.meta.url).pathname;
const OUT = `${HERE}..`;

const pw = await import(`file://${ROOT}/backend/node_modules/playwright/index.js`);
const { chromium } = pw.chromium ? pw : pw.default;

const dataUrl = (file) =>
  `data:image/png;base64,${readFileSync(`${OUT}/${file}`).toString("base64")}`;

/** One panel: the whole image, or a crop rectangle given in source pixels. */
function panel({ file, label, crop, displayW, displayH }) {
  const src = dataUrl(file);
  const c = crop ?? { x: 0, y: 0, w: 3200, h: 2000 };
  const scale = displayH ? displayH / c.h : displayW / c.w;
  const w = Math.round(c.w * scale);
  const h = Math.round(c.h * scale);
  return `
    <figure style="margin:0">
      <figcaption>${label}</figcaption>
      <div class="frame" style="width:${w}px;height:${h}px">
        <img src="${src}" style="width:${Math.round(3200 * scale)}px;
             margin-left:${-Math.round(c.x * scale)}px;margin-top:${-Math.round(c.y * scale)}px" />
      </div>
    </figure>`;
}

const LAYOUTS = {
  cover: {
    out: "cover-original-vs-rebuild.png",
    width: 1600,
    panels: [
      { file: "01-original-working-version.png", label: "Original build", displayW: 736 },
      { file: "04-missing-results-decision.png", label: "Deliberate rebuild", displayW: 736 },
    ],
  },
  warning: {
    out: "comparison-warning-vs-decision.png",
    width: 2000,
    panels: [
      {
        // The original's whole treatment of what the agent was unsure about: the
        // read-only decision summary, its amber warning line, and the expansion notes.
        file: "01-original-working-version.png",
        label: "Warning",
        crop: { x: 96, y: 400, w: 2330, h: 1300 },
        displayH: 800,
      },
      {
        file: "04-missing-results-decision.png",
        label: "Human decision",
        crop: { x: 2540, y: 730, w: 655, h: 1255 },
        displayH: 800,
      },
    ],
  },
};

const layout = LAYOUTS[process.argv[2]];
if (!layout) throw new Error(`unknown layout: ${process.argv[2]}`);

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({
  viewport: { width: layout.width, height: 400 },
  deviceScaleFactor: 2,
});

await page.setContent(`
  <style>
    html, body { margin: 0; background: #F6F4EF; }
    .row { display: flex; align-items: flex-start; justify-content: center;
           gap: 26px; padding: 34px 30px 36px; }
    figcaption { font: 600 12px/1 -apple-system, "Helvetica Neue", Arial, sans-serif;
                 letter-spacing: .14em; text-transform: uppercase;
                 color: #6B6357; margin: 0 0 11px 2px; }
    .frame { overflow: hidden; border: 1px solid rgba(31,32,29,.12); border-radius: 8px;
             background: #fff; box-shadow: 0 8px 22px rgba(31,32,29,.08); }
    img { display: block; max-width: none; }
  </style>
  <div class="row">${layout.panels.map(panel).join("")}</div>
`);

const row = await page.locator(".row").boundingBox();
await page.setViewportSize({ width: layout.width, height: Math.ceil(row.height) });
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/${layout.out}` });
console.log(`✓ ${layout.out}`);

await browser.close();
