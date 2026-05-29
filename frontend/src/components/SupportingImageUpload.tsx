import { useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { readImageFromClipboard } from "../lib/clipboardImage";
import {
  IMAGE_ACCEPTED_MIME,
  checkImageFileSize,
  fileToDataUrl,
} from "../lib/imageUpload";

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

const ACCEPTED = IMAGE_ACCEPTED_MIME;

export default function SupportingImageUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      onChange(dataUrl);
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
    if (!imageItem) {
      setWarning("No image found in clipboard.");
      return;
    }
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

  function handleThumbKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (busy) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <div tabIndex={0} onPaste={handlePaste} className="focus:outline-none">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-start gap-3">
        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-disabled={busy}
          aria-label={value ? "Replace supporting image" : "Upload supporting image"}
          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}
          onKeyDown={handleThumbKeyDown}
          className="flex h-14 w-24 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-colors hover:border-indigo-400 hover:bg-indigo-50/40 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 aria-disabled:opacity-60"
        >
          {busy ? (
            <span className="text-[10px] font-medium text-slate-500">Processing…</span>
          ) : value ? (
            <img
              src={value}
              alt="Supporting visual preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-20 items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] font-medium text-slate-400">
              Image
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => void handlePasteButton()}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Paste image
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={busy}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            Diagram, screenshot, or chart. Paste with Cmd+V / Ctrl+V.
          </p>
        </div>
      </div>
      {warning && <p className="mt-2 text-xs text-amber-700">{warning}</p>}
    </div>
  );
}
