import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Browser } from "playwright";

const require = createRequire(import.meta.url);

let mermaidBundle: string | null = null;
function getMermaidBundle(): string {
  if (mermaidBundle !== null) return mermaidBundle;
  const pkgPath = require.resolve("mermaid/package.json");
  const distDir = path.join(path.dirname(pkgPath), "dist");
  const candidate = path.join(distDir, "mermaid.min.js");
  if (!fs.existsSync(candidate)) {
    throw new Error(`Mermaid bundle not found at ${candidate}`);
  }
  mermaidBundle = fs.readFileSync(candidate, "utf8");
  return mermaidBundle;
}

const ALLOWED_DIRECTIVE = /^flowchart\s+(LR|TD)\s*$/;

export function sanitizeMermaidCode(input: string): string | null {
  if (!input) return null;
  const lines = input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return null;

  // First non-empty line must be `flowchart LR` or `flowchart TD`.
  if (!ALLOWED_DIRECTIVE.test(lines[0]!.trim())) {
    return null;
  }

  const cleaned: string[] = [];
  for (const raw of lines.slice(0, 14)) {
    const line = raw.replace(/[`]/g, "");
    if (/^\s*click\s+/i.test(line)) continue; // drop interaction directives
    if (/<\s*\/?\s*[a-z]/i.test(line)) continue; // drop HTML-ish lines
    cleaned.push(line);
  }

  if (cleaned.length < 2) return null;
  cleaned[0] = cleaned[0]!.trim();
  return cleaned.join("\n");
}

export interface MermaidRenderResult {
  svg: string;
  fallback: boolean;
}

export async function renderMermaidToSvg(
  code: string,
  browser: Browser
): Promise<MermaidRenderResult> {
  const sanitized = sanitizeMermaidCode(code);
  if (!sanitized) {
    return { svg: "", fallback: true };
  }

  const bundle = getMermaidBundle();

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: -apple-system, "Inter", "Segoe UI", Helvetica, Arial, sans-serif; }
  </style></head><body><div id="root"></div><script>${bundle}</script>
  <script>
    window.__renderResult = { ok: false, svg: "", error: "" };
    (async () => {
      try {
        if (!window.mermaid) throw new Error("mermaid global missing");
        window.mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            fontFamily: "-apple-system, Inter, Segoe UI, Helvetica, Arial, sans-serif",
            primaryColor: "#f8fafc",
            primaryBorderColor: "#0F172A",
            primaryTextColor: "#0F172A",
            lineColor: "#475569",
            tertiaryColor: "#ffffff",
          },
          flowchart: { useMaxWidth: true, htmlLabels: false },
        });
        const id = "diagram-" + Math.random().toString(36).slice(2);
        const { svg } = await window.mermaid.render(id, ${JSON.stringify(sanitized)});
        window.__renderResult = { ok: true, svg: svg, error: "" };
      } catch (err) {
        window.__renderResult = { ok: false, svg: "", error: String(err && err.message || err) };
      } finally {
        window.__renderDone = true;
      }
    })();
  </script></body></html>`;

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction(
      () => (globalThis as any).__renderDone === true,
      undefined,
      { timeout: 8000 }
    );
    const result = (await page.evaluate(
      () => (globalThis as any).__renderResult
    )) as { ok: boolean; svg: string; error: string };
    if (!result.ok || !result.svg) {
      return { svg: "", fallback: true };
    }
    return { svg: result.svg, fallback: false };
  } catch {
    return { svg: "", fallback: true };
  } finally {
    await page.close();
    await context.close();
  }
}
