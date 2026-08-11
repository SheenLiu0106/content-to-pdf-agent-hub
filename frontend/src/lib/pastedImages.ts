import type { ClipboardEvent } from "react";
import type { InlineVisualBlock } from "@shared/useCaseSchema";

import { createPastedInlineVisual } from "./inlineVisuals";
import { checkImageFileSize, fileToDataUrl } from "./imageUpload";

// Clipboard image handling for the source field. Lifted out of the old PasteArea
// component so the Create intake reuses the behaviour rather than re-implementing it.

const PASTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function collectClipboardImages(event: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const seen = new Set<File>();
  const out: File[] = [];

  const files = event.clipboardData?.files;
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (file && file.type.startsWith("image/") && !seen.has(file)) {
        seen.add(file);
        out.push(file);
      }
    }
  }

  const items = event.clipboardData?.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file && !seen.has(file)) {
          seen.add(file);
          out.push(file);
        }
      }
    }
  }

  return out;
}

/**
 * Turns images pasted alongside text into inline visual blocks.
 *
 * Deliberately does NOT call preventDefault: the textarea must still receive any
 * plain text copied with the image. Undecodable or oversized images are skipped
 * rather than blocking the paste.
 */
export async function collectPastedInlineVisuals(
  event: ClipboardEvent<HTMLTextAreaElement>
): Promise<InlineVisualBlock[]> {
  const candidates = collectClipboardImages(event).filter((f) =>
    PASTED_MIME_TYPES.has(f.type)
  );
  if (candidates.length === 0) return [];

  const visuals: InlineVisualBlock[] = [];
  for (const file of candidates) {
    if (!checkImageFileSize(file).ok) continue;
    try {
      visuals.push(createPastedInlineVisual(await fileToDataUrl(file), 0));
    } catch {
      // Skip images we can't decode; never block paste.
    }
  }
  return visuals;
}
