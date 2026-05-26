import { useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { readImageFromClipboard } from "../lib/clipboardImage";

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

const ACCEPTED = "image/png,image/jpeg,image/webp";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const WARN_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1600;

async function downscaleToDataUrl(file: File): Promise<string> {
  const isWebp = file.type === "image/webp";
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  let outW = width;
  let outH = height;
  if (longest > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / longest;
    outW = Math.round(width * scale);
    outH = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, outW, outH);
  bitmap.close?.();
  const mime = isWebp ? "image/webp" : "image/jpeg";
  return canvas.toDataURL(mime, 0.85);
}

export default function HeroImageUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setWarning(null);
    if (file.size > MAX_FILE_BYTES) {
      setWarning("File is larger than 8MB. Please choose a smaller image.");
      return;
    }
    if (file.size > WARN_FILE_BYTES) {
      setWarning("Image is larger than 2MB — it will be downscaled for you.");
    }
    setBusy(true);
    try {
      const dataUrl = await downscaleToDataUrl(file);
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
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Hero Image
        </label>
        <span className="text-[11px] text-slate-400">Page 1 cover</span>
      </div>
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
          aria-label={value ? "Replace hero image" : "Upload hero image"}
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
              alt="Hero preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-20 items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] font-medium text-slate-400">
              Hero
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
            Upload from file, paste with Cmd+V / Ctrl+V, or use Paste image.
          </p>
          <p className="text-[11px] text-slate-400">PNG, JPG, WebP · up to 8 MB</p>
        </div>
      </div>
      {warning && <p className="mt-2 text-xs text-amber-700">{warning}</p>}
    </div>
  );
}
