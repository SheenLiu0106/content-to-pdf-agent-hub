import { randomUUID } from "node:crypto";
import type {
  InlineVisualBlock,
  NarrativeSection,
} from "./useCaseSchema.js";

export interface ExtractedInlineVisual {
  visual: InlineVisualBlock;
  // Character offset of the original match in the raw text, before any
  // substitution. Used later to associate the visual with the closest
  // narrative section body.
  sourceOffset: number;
}

export interface ExtractInlineVisualsResult {
  cleanedText: string;
  inlineVisuals: ExtractedInlineVisual[];
}

// Order matters: HTML tag first so we don't grab an alt-text attribute that
// happens to also match the markdown pattern; markdown next; placeholder last.
const HTML_IMG_RE =
  /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*?(?:\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?[^>]*\/?>/gi;
const MARKDOWN_IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const PLACEHOLDER_RE = /\[(?:Image|Insert image|Figure)\s*:\s*([^\]]+)\]/gi;

function trimOrUndef(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

// Replace a slice of `text` with a single space so paragraph structure (blank
// lines, sentences) isn't destroyed by removing image markers.
function spliceOut(text: string, start: number, end: number): string {
  return text.slice(0, start) + " " + text.slice(end);
}

interface PendingMatch {
  start: number;
  end: number;
  visual: InlineVisualBlock;
}

function collectMatches(raw: string): PendingMatch[] {
  const matches: PendingMatch[] = [];

  // HTML <img> tags
  HTML_IMG_RE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = HTML_IMG_RE.exec(raw)); ) {
    const src = trimOrUndef(m[1] ?? m[2] ?? m[3]);
    const alt = trimOrUndef(m[4] ?? m[5] ?? m[6]);
    if (!src) continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      visual: {
        id: randomUUID(),
        kind: "image",
        sourceType: "url",
        src,
        caption: alt,
        altText: alt,
        placement: "after_first_paragraph",
        status: "ready",
      },
    });
  }

  // Markdown ![alt](url "title")
  MARKDOWN_IMG_RE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = MARKDOWN_IMG_RE.exec(raw)); ) {
    const alt = trimOrUndef(m[1]);
    const src = trimOrUndef(m[2]);
    const title = trimOrUndef(m[3]);
    if (!src) continue;
    const caption = alt ?? title;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      visual: {
        id: randomUUID(),
        kind: "image",
        sourceType: "url",
        src,
        caption,
        altText: caption,
        placement: "after_first_paragraph",
        status: "ready",
      },
    });
  }

  // Text placeholders: [Image: ...], [Insert image: ...], [Figure: ...]
  PLACEHOLDER_RE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = PLACEHOLDER_RE.exec(raw)); ) {
    const caption = trimOrUndef(m[1]);
    if (!caption) continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      visual: {
        id: randomUUID(),
        kind: "image_slot",
        sourceType: "missing",
        caption,
        altText: caption,
        placement: "after_section",
        status: "needs_upload",
      },
    });
  }

  return matches;
}

// Drop matches whose span overlaps an earlier (longer, more-specific) match.
// HTML and Markdown can overlap in pathological inputs; if so, keep the
// earliest one and discard later overlaps.
function dedupeOverlaps(matches: PendingMatch[]): PendingMatch[] {
  const sorted = matches.slice().sort((a, b) => a.start - b.start);
  const out: PendingMatch[] = [];
  let lastEnd = -1;
  for (const m of sorted) {
    if (m.start < lastEnd) continue;
    out.push(m);
    lastEnd = m.end;
  }
  return out;
}

export function extractInlineVisuals(
  raw: string
): ExtractInlineVisualsResult {
  if (!raw || raw.length === 0) {
    return { cleanedText: raw ?? "", inlineVisuals: [] };
  }
  const matches = dedupeOverlaps(collectMatches(raw));
  if (matches.length === 0) {
    return { cleanedText: raw, inlineVisuals: [] };
  }

  // Splice out from the end so earlier offsets remain valid.
  let cleaned = raw;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    cleaned = spliceOut(cleaned, m.start, m.end);
  }

  // Collapse runs of spaces left behind by the splices, but preserve blank
  // lines (paragraph breaks).
  cleaned = cleaned.replace(/[^\S\n]{2,}/g, " ").replace(/ \n/g, "\n");

  return {
    cleanedText: cleaned,
    inlineVisuals: matches.map((m) => ({
      visual: m.visual,
      sourceOffset: m.start,
    })),
  };
}

// Map preprocessor-detected visuals onto narrative sections by matching the
// source offset to the section whose body text appears closest in the raw
// input. If a section's body can't be located, fall back to assigning the
// visual to the last section. If no sections exist, drop the visual.
//
// This is a heuristic: we accept that occasionally a visual will land on the
// wrong section, and the user can fix it by changing the section in the
// editor. The point is not perfection — it's avoiding the obvious mistake
// of dumping every image at section 0.
export function assignVisualsToSections(
  raw: string,
  extracted: ExtractedInlineVisual[],
  sections: NarrativeSection[]
): InlineVisualBlock[] {
  if (extracted.length === 0) return [];
  if (sections.length === 0) {
    // Without sections we can't render inline visuals — drop them.
    return [];
  }

  // For each section, find the offset of its body in the original raw input.
  // If we can't find a section's body (e.g., LLM rewrote it heavily), use
  // sentinel offset Infinity so the visual gravitates to a section we can
  // place.
  const sectionStarts = sections.map((s) => {
    const probe = s.body.trim().slice(0, 40);
    if (!probe) return -1;
    const idx = raw.indexOf(probe);
    return idx;
  });
  const fallbackIndex = sections.length - 1;

  return extracted.map(({ visual, sourceOffset }) => {
    // Find the section whose body starts at or before this offset, but the
    // closest one. If no body starts at or before, pick the closest body
    // overall.
    let bestIdx = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < sectionStarts.length; i++) {
      const start = sectionStarts[i]!;
      if (start < 0) continue;
      // Prefer sections that contain this offset; fall back to nearest.
      const distance =
        start <= sourceOffset ? sourceOffset - start : (start - sourceOffset) * 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIdx = i;
      }
    }
    const sectionIndex = bestIdx >= 0 ? bestIdx : fallbackIndex;
    return { ...visual, sectionIndex };
  });
}

// Merge preprocessor-detected and LLM-emitted visuals. Dedupes by:
//   1. src (case-insensitive) for ready images
//   2. caption (lowercased, trimmed) for slots/recommendations
// Earlier entries (preprocessor) win over later (LLM) — the preprocessor has
// the authoritative URL/alt text from the source.
export function mergeInlineVisuals(
  primary: InlineVisualBlock[],
  secondary: InlineVisualBlock[]
): InlineVisualBlock[] {
  const seenSrc = new Set<string>();
  const seenCaption = new Set<string>();
  const out: InlineVisualBlock[] = [];

  const consider = (v: InlineVisualBlock): void => {
    const srcKey = v.src ? v.src.toLowerCase() : null;
    const captionKey = v.caption ? v.caption.trim().toLowerCase() : null;
    if (srcKey && seenSrc.has(srcKey)) return;
    if (!srcKey && captionKey && seenCaption.has(captionKey)) return;
    if (srcKey) seenSrc.add(srcKey);
    if (captionKey) seenCaption.add(captionKey);
    out.push(v);
  };

  for (const v of primary) consider(v);
  for (const v of secondary) consider(v);
  return out;
}
