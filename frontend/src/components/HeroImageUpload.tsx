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

export default function HeroImageUpload({ value, onChange }: Props) {
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
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wide text-ink-mute">
          Hero Image
        </label>
        <span className="text-[11px] text-ink-faint">Page 1 cover</span>
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
          className="flex h-14 w-24 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[7px] border border-hair bg-shell-pane transition-colors hover:border-ember-400 hover:bg-ember-tint focus:border-ember-400 focus:outline-none focus:ring-2 focus:ring-ember-500/20 aria-disabled:opacity-60"
        >
          {busy ? (
            <span className="text-[10px] font-medium text-ink-mute">Processing…</span>
          ) : value ? (
            <img
              src={value}
              alt="Hero preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-20 items-center justify-center rounded-[6px] border border-dashed border-hair-strong text-[10px] font-medium text-ink-faint">
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
              className="rounded-[6px] border border-hair-strong bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-soft shadow-sm hover:bg-shell-pane disabled:cursor-not-allowed disabled:opacity-60"
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => void handlePasteButton()}
              disabled={busy}
              className="rounded-[6px] border border-hair-strong bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-soft shadow-sm hover:bg-shell-pane disabled:cursor-not-allowed disabled:opacity-60"
            >
              Paste image
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={busy}
                className="rounded-[6px] px-2.5 py-1.5 text-xs font-semibold text-alert-ink hover:bg-alert-tint disabled:cursor-not-allowed disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-ink-mute">
            Upload from file, paste with Cmd+V / Ctrl+V, or use Paste image.
          </p>
          <p className="text-[11px] text-ink-faint">PNG, JPG, WebP · up to 8 MB</p>
        </div>
      </div>
      {warning && <p className="mt-2 text-xs text-review-ink">{warning}</p>}
    </div>
  );
}
