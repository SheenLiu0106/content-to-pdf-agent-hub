import { useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import type { InlineVisualBlock } from "@shared/useCaseSchema";
import { readImageFromClipboard } from "../lib/clipboardImage";
import {
  IMAGE_ACCEPTED_MIME,
  checkImageFileSize,
  fileToDataUrl,
} from "../lib/imageUpload";

interface Props {
  visual: InlineVisualBlock;
  onChange: (next: InlineVisualBlock) => void;
  onRemove: () => void;
}

const PLACEMENT_LABELS: Record<string, string> = {
  after_first_paragraph: "After first paragraph",
  after_section: "After section",
  after_section_heading: "After section heading",
  between_paragraphs: "Between paragraphs",
  manual: "Manual",
};

// Renderer only honors after_first_paragraph and after_section for MVP; the
// other enum values fall back to after_section in the backend. We expose
// only the two real choices in the dropdown.
const PLACEMENT_CHOICES: InlineVisualBlock["placement"][] = [
  "after_first_paragraph",
  "after_section",
];

export default function InlineVisualEditor({ visual, onChange, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSlot = visual.kind === "image_slot";
  const previewSrc = visual.dataUrl ?? visual.src ?? null;

  async function handleFile(file: File) {
    setWarning(null);
    const sizeCheck = checkImageFileSize(file);
    if (!sizeCheck.ok) {
      setWarning(sizeCheck.warning);
      return;
    }
    if (sizeCheck.warning) setWarning(sizeCheck.warning);
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      onChange({
        ...visual,
        kind: "image",
        sourceType: "uploaded",
        dataUrl,
        // keep src around for traceability if the visual originated from a URL
        status: "ready",
      });
    } catch (err) {
      setWarning(`Failed to read image: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLElement>) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(
      (it) => it.kind === "file" && it.type.startsWith("image/")
    );
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) void handleFile(file);
  }

  async function handlePasteButton() {
    if (busy) return;
    setWarning(null);
    const r = await readImageFromClipboard();
    if (!r.ok) {
      setWarning(r.message);
      return;
    }
    await handleFile(r.file);
  }

  function handleCaptionChange(value: string) {
    const caption = value.trim().length > 0 ? value : undefined;
    onChange({ ...visual, caption, altText: caption ?? visual.altText });
  }

  function handlePlacementChange(value: string) {
    const placement = value as InlineVisualBlock["placement"];
    onChange({ ...visual, placement });
  }

  const labelText = isSlot
    ? visual.status === "recommended"
      ? "Suggested image slot"
      : "Image slot — needs upload"
    : "Inline image";

  return (
    <div
      tabIndex={0}
      onPaste={handlePaste}
      className={`rounded-xl border p-3 shadow-inner focus:outline-none ${
        isSlot
          ? "border-dashed border-amber-300 bg-amber-50/40"
          : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPTED_MIME}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
            isSlot ? "text-amber-700" : "text-slate-500"
          }`}
        >
          {labelText}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          {isSlot ? "Dismiss" : "Remove"}
        </button>
      </div>

      <div className="flex items-start gap-3">
        <div
          className={`flex h-16 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
            previewSrc
              ? "border-slate-200 bg-white"
              : "border-dashed border-slate-300 bg-white/60"
          }`}
        >
          {busy ? (
            <span className="text-[10px] font-medium text-slate-500">Processing…</span>
          ) : previewSrc ? (
            <img
              src={previewSrc}
              alt={visual.altText ?? visual.caption ?? "Inline visual"}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[10px] font-medium text-slate-400">Image</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            type="text"
            value={visual.caption ?? ""}
            onChange={(e) => handleCaptionChange(e.target.value)}
            placeholder="Caption (shown below the image)"
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          {!isSlot && (
            <select
              value={visual.placement}
              onChange={(e) => handlePlacementChange(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              {PLACEMENT_CHOICES.map((p) => (
                <option key={p} value={p}>
                  {PLACEMENT_LABELS[p] ?? p}
                </option>
              ))}
            </select>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {previewSrc ? "Replace" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => void handlePasteButton()}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Paste image
            </button>
          </div>
        </div>
      </div>

      {visual.src && !visual.dataUrl && !isSlot && (
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Source URL: <span className="break-all text-slate-600">{visual.src}</span> —
          fetched at render time. Upload to embed a guaranteed copy.
        </p>
      )}
      {warning && <p className="mt-2 text-xs text-amber-700">{warning}</p>}
    </div>
  );
}
