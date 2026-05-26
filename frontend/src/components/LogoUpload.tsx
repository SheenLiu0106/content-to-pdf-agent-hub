import { useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { readImageFromClipboard } from "../lib/clipboardImage";

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

const ACCEPTED = "image/png,image/jpeg,image/svg+xml";
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export default function LogoUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleFile(file: File) {
    setWarning(null);
    if (file.size > MAX_FILE_BYTES) {
      setWarning("Logo file must be 2MB or smaller.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      setWarning("Logo must be PNG, JPG, or SVG.");
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setWarning(`Failed to read logo: ${(err as Error).message}`);
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
    setWarning(null);
    const r = await readImageFromClipboard();
    if (!r.ok) {
      setWarning(r.message);
      return;
    }
    await handleFile(r.file);
  }

  function handleThumbKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <div tabIndex={0} onPaste={handlePaste} className="focus:outline-none">
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Logo
        </label>
        <span className="text-[11px] text-slate-400">Optional</span>
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
          tabIndex={0}
          aria-label={value ? "Replace logo" : "Upload logo"}
          onClick={() => inputRef.current?.click()}
          onKeyDown={handleThumbKeyDown}
          className="flex h-14 w-14 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-colors hover:border-indigo-400 hover:bg-indigo-50/40 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          {value ? (
            <img
              src={value}
              alt="Logo preview"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] font-medium text-slate-400">
              Logo
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => void handlePasteButton()}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Paste image
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            Upload from file, paste with Cmd+V / Ctrl+V, or use Paste image.
          </p>
          <p className="text-[11px] text-slate-400">PNG, JPG, SVG · up to 2 MB</p>
        </div>
      </div>
      {warning && <p className="mt-2 text-xs text-amber-700">{warning}</p>}
    </div>
  );
}
