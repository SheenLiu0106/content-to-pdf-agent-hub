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
    <div className="flex flex-col gap-5">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        placeholder="Paste a customer story, case study draft, project recap, or any narrative content. The AI will identify the structure (goals, challenges, solutions, results) and prepare it for review."
        className="min-h-[340px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50/60 p-5 font-sans text-[15px] leading-relaxed text-slate-800 outline-none transition-all duration-300 ease-out placeholder:text-slate-400 focus:border-indigo-400/60 focus:bg-white focus:ring-4 focus:ring-indigo-500/[0.10]"
        disabled={loading}
      />
      {pastedImageCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {pastedImageCount} pasted image{pastedImageCount === 1 ? "" : "s"} captured for Article Report.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <span className="tabular-nums tracking-tight">
          {length.toLocaleString()} / {MAX.toLocaleString()} chars
          {tooShort && length > 0 && (
            <span className="ml-2 font-medium text-amber-500">need at least {MIN}</span>
          )}
          {tooLong && (
            <span className="ml-2 font-medium text-rose-500">
              too long — split into smaller chunks
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onExtract}
          disabled={!canExtract}
          title={
            tooShort
              ? "Paste content to continue"
              : tooLong
                ? "Content too long"
                : "Extract structure with AI"
          }
          className="group inline-flex items-center gap-3 rounded-full bg-slate-900 py-2 pl-6 pr-2 text-sm font-semibold text-white shadow-soft-sm transition-all duration-300 ease-out hover:-translate-y-px hover:bg-slate-800 hover:shadow-soft active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none disabled:hover:translate-y-0"
        >
          {loading ? "Extracting…" : "Extract content"}
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-spring group-hover:translate-x-0.5 group-hover:scale-105 group-disabled:bg-white/10">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}
