import type { ClipboardEvent } from "react";
import type { InlineVisualBlock } from "@shared/useCaseSchema";
import { createPastedInlineVisual } from "../lib/inlineVisuals";
import { checkImageFileSize, fileToDataUrl } from "../lib/imageUpload";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onExtract: () => void;
  loading: boolean;
  onInlineImagesPasted?: (visuals: InlineVisualBlock[]) => void;
  pastedImageCount?: number;
}

const MIN = 20;
const MAX = 50_000;
const PASTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function collectClipboardImages(
  event: ClipboardEvent<HTMLTextAreaElement>
): File[] {
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

export default function PasteArea({
  value,
  onChange,
  onExtract,
  loading,
  onInlineImagesPasted,
  pastedImageCount = 0,
}: Props) {
  const length = value.length;
  const tooShort = length < MIN;
  const tooLong = length > MAX;
  const canExtract = !tooShort && !tooLong && !loading;

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onInlineImagesPasted) return;
    const candidates = collectClipboardImages(event).filter((file) =>
      PASTED_MIME_TYPES.has(file.type)
    );
    if (candidates.length === 0) return;

    // Intentionally NOT calling event.preventDefault() — the textarea must
    // still receive any plain text the user copied alongside the image.
    void (async () => {
      const visuals: InlineVisualBlock[] = [];
      for (const file of candidates) {
        const sizeCheck = checkImageFileSize(file);
        if (!sizeCheck.ok) continue;
        try {
          const dataUrl = await fileToDataUrl(file);
          visuals.push(createPastedInlineVisual(dataUrl, 0));
        } catch {
          // Skip images we can't decode; never block paste.
        }
      }
      if (visuals.length > 0) {
        onInlineImagesPasted(visuals);
      }
    })();
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        placeholder="Paste a customer story, case study draft, project recap, or any narrative content. The AI will identify the structure (goals, challenges, solutions, results) and prepare it for review."
        className="min-h-[320px] w-full resize-y rounded-lg border border-slate-300 bg-slate-50/50 p-4 font-sans text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        disabled={loading}
      />
      {pastedImageCount > 0 && (
        <p className="text-xs text-emerald-700">
          {pastedImageCount} pasted image{pastedImageCount === 1 ? "" : "s"} captured for Article Report.
        </p>
      )}
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          {length.toLocaleString()} / {MAX.toLocaleString()} chars
          {tooShort && length > 0 && <span className="ml-2 text-amber-600">need at least {MIN}</span>}
          {tooLong && <span className="ml-2 text-red-600">too long — split into smaller chunks</span>}
        </span>
        <button
          type="button"
          onClick={onExtract}
          disabled={!canExtract}
          title={tooShort ? "Paste content to continue" : tooLong ? "Content too long" : "Extract structure with AI"}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Extracting…" : "Extract content →"}
        </button>
      </div>
    </div>
  );
}
