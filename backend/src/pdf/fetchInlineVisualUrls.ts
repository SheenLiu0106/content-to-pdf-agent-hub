import type { InlineVisualBlock } from "../shared/useCaseSchema.js";

// Single-image fetch, not crawling. Run at render time on visuals that came
// in as external URLs (Markdown / HTML img tags) so the PDF embeds the bytes
// directly rather than relying on Playwright to fetch them mid-render.
// Anything that can't be fetched cleanly is marked status:"failed" — the
// renderer then drops it instead of leaking a broken-image icon into the PDF.

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 5 * 1024 * 1024;

const SUPPORTED_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

// Map a Content-Type into the data: URL mime — the article_report
// HERO_IMAGE_DATA_URL_RE in normalize only accepts png/jpe?g/webp, so SVG and
// GIF survive the fetch but get rejected at validation. That's intentional
// for MVP: the PDF embed pipeline has been tested with raster formats only.
function isSupportedMime(mime: string | null): boolean {
  if (!mime) return false;
  return SUPPORTED_MIME.has(mime.toLowerCase().split(";")[0]!.trim());
}

async function fetchOne(src: string): Promise<{ dataUrl: string } | null> {
  let response: Response;
  try {
    response = await fetch(src, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const mime = response.headers.get("content-type");
  if (!isSupportedMime(mime)) return null;

  const cleanMime = mime!.toLowerCase().split(";")[0]!.trim();

  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    return null;
  }
  if (buffer.byteLength > MAX_BYTES) return null;

  const base64 = Buffer.from(buffer).toString("base64");
  // Normalize image/jpg → image/jpeg so the data URL matches the validation
  // regex used elsewhere in the codebase.
  const normalizedMime = cleanMime === "image/jpg" ? "image/jpeg" : cleanMime;
  return { dataUrl: `data:${normalizedMime};base64,${base64}` };
}

export async function resolveInlineVisualUrls(
  visuals: InlineVisualBlock[]
): Promise<InlineVisualBlock[]> {
  if (visuals.length === 0) return visuals;

  // Fetch in parallel — order doesn't matter, and the small fan-out keeps
  // render-time latency bounded by the slowest single fetch.
  const resolved = await Promise.all(
    visuals.map(async (v) => {
      // Skip visuals that already have an embedded data URL or aren't fetchable.
      if (v.dataUrl) return v;
      if (v.kind !== "image") return v;
      if (v.sourceType !== "url" && v.sourceType !== "pasted") return v;
      if (!v.src) return v;

      const fetched = await fetchOne(v.src);
      if (!fetched) {
        return { ...v, status: "failed" as const };
      }
      return { ...v, dataUrl: fetched.dataUrl, status: "ready" as const };
    })
  );

  return resolved;
}
