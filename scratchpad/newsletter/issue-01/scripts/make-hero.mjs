/*
 * Builds the abstract brand hero image used on the case-study cover, then applies
 * it (with the logo) through the same PATCH update_config action the app uses.
 * Deliberately non-photographic: a generated geometric composition in the brand
 * colours, so nothing in the screenshots implies a real place or customer.
 */
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = "/Users/sheen/Repos/content-to-pdf";
const HERE = new URL(".", import.meta.url).pathname;
const API = "http://127.0.0.1:8788/api/runs";
const RUN = process.env.RUN_ID ?? "063bf9e7-db92-4488-b76c-5312fd02b7c6";

const pw = await import(`file://${ROOT}/backend/node_modules/playwright/index.js`);
const { chromium } = pw.chromium ? pw : pw.default;

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1800, height: 680 } });
await page.setContent(`
  <style>
    html, body { margin: 0; height: 100%; }
    body {
      background:
        radial-gradient(120% 140% at 78% 8%, rgba(194,112,61,0.42) 0%, rgba(194,112,61,0) 46%),
        linear-gradient(118deg, #142823 0%, #1E3A34 46%, #2C5148 100%);
      position: relative; overflow: hidden;
    }
    .grid {
      position: absolute; inset: -10%;
      background-image:
        linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px);
      background-size: 74px 74px;
      transform: rotate(-9deg);
    }
    .arc { position: absolute; border-radius: 50%; border: 1px solid rgba(255,255,255,0.12); }
    .a1 { width: 980px; height: 980px; right: -220px; top: -300px; }
    .a2 { width: 1360px; height: 1360px; right: -420px; top: -520px; border-color: rgba(194,112,61,0.26); }
    .bar { position: absolute; height: 6px; border-radius: 3px; background: rgba(194,112,61,0.85); }
    .b1 { width: 210px; left: 118px; bottom: 150px; }
    .b2 { width: 96px; left: 118px; bottom: 128px; background: rgba(255,255,255,0.32); }
    .dots { position: absolute; left: 110px; top: 120px; display: grid; grid-template-columns: repeat(6, 26px); gap: 26px; }
    .dots i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,0.22); display: block; }
    .fade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,20,18,0.34) 0%, rgba(10,20,18,0) 42%); }
  </style>
  <div class="grid"></div>
  <div class="arc a1"></div>
  <div class="arc a2"></div>
  <div class="dots">${"<i></i>".repeat(24)}</div>
  <div class="bar b1"></div>
  <div class="bar b2"></div>
  <div class="fade"></div>
`);
const png = await page.screenshot({ type: "png" });
writeFileSync(`${HERE}../fixtures/brightwater-hero.png`, png);
await browser.close();
console.log(`✓ hero ${(png.length / 1024).toFixed(0)} KB`);

const logo = readFileSync(`${HERE}../fixtures/brightwater-logo.svg`);
const detail = await (await fetch(`${API}/${RUN}`)).json();

const res = await fetch(`${API}/${RUN}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    action: "update_config",
    config: {
      ...detail.run.config,
      logoDataUrl: `data:image/svg+xml;base64,${logo.toString("base64")}`,
      heroImageDataUrl: `data:image/png;base64,${png.toString("base64")}`,
    },
  }),
});
console.log(res.status, (await res.text()).slice(0, 160));
