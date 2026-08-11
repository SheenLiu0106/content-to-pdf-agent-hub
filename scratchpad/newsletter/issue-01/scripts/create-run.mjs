// Creates one durable production run from the sanitized newsletter fixture,
// against the real backend on :8788. Screenshot support only — nothing here is
// imported by the application.
import { readFileSync } from "node:fs";

const HERE = new URL(".", import.meta.url).pathname;
const RAW = readFileSync(`${HERE}../fixtures/source-brightwater.md`, "utf8");

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48">
  <rect x="0" y="8" width="32" height="32" rx="7" fill="#1E3A34"/>
  <path d="M8 30c4-9 12-9 16 0" stroke="#C2703D" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="16" cy="19" r="3.2" fill="#C2703D"/>
  <text x="42" y="27" font-family="Georgia, serif" font-size="15" font-weight="700" fill="#1E3A34" letter-spacing="0.5">BRIGHTWATER</text>
  <text x="42" y="39" font-family="Helvetica, Arial, sans-serif" font-size="7.5" fill="#6B6357" letter-spacing="2.4">FACILITIES GROUP</text>
</svg>`;

const config = {
  templateId: "usecase",
  brandName: "Brightwater Facilities Group",
  brandWebsite: "www.brightwater-fm.example",
  documentLabel: "CUSTOMER CASE STUDY",
  brandCopyright: "© 2026 Brightwater Facilities Group. All rights reserved.",
  primaryColor: "#1E3A34",
  accentColor: "#C2703D",
  logoDataUrl: `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`,
  heroImageDataUrl: null,
  supportingVisualEnabled: false,
  supportingVisualType: null,
  supportingImageDataUrl: null,
  supportingImageCaption: null,
  mermaidVerified: false,
  pdfLengthMode: "compact-2-page",
};

const res = await fetch("http://127.0.0.1:8788/api/runs", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    items: [{ name: "brightwater-fieldsync-notes.md", rawContent: RAW }],
    options: {
      name: "Brightwater FieldSync case study",
      reviewPolicy: "only_when_flagged",
      approvalMode: "required",
      config,
    },
  }),
});

console.log(res.status, JSON.stringify(await res.json(), null, 2));
