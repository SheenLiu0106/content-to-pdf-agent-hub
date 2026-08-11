import { useId, useRef } from "react";
import type { InlineVisualBlock } from "@shared/useCaseSchema";

import { collectPastedInlineVisuals } from "../../lib/pastedImages";
import {
  ACCEPT_ATTR,
  FORMAT_HINT,
  MAX_CHARS,
  MAX_ITEMS,
  readStagedFiles,
  type StagedFile,
} from "../../lib/stagedFiles";

export type SourceMode = "single" | "batch";

interface Props {
  mode: SourceMode;
  onModeChange: (next: SourceMode) => void;
  /** Single-document paste buffer. */
  raw: string;
  onRawChange: (next: string) => void;
  onInlineImagesPasted: (visuals: InlineVisualBlock[]) => void;
  pastedImageCount: number;
  /** Batch mode staged files. */
  files: StagedFile[];
  onFilesChange: (next: StagedFile[]) => void;
  disabled: boolean;
}

// Realistic starting points. Clicking one fills the textarea so the empty state is
// useful rather than decorative.
const EXAMPLES = [
  {
    label: "Customer success story",
    text: `Northwind Logistics ran month-end close through spreadsheets emailed between four regional controllers. Every cycle took ten business days and produced a different set of adjusting entries.

The finance team consolidated every regional ledger into one system, gave a single controller ownership of the close calendar, templated the recurring journal entries, and published a shared reconciliation dashboard.

Close now finishes in three business days. Adjusting entries dropped by more than half and the audit trail is complete for the first time.`,
  },
  {
    label: "Internal project recap",
    text: `Our support team handled every escalation manually through a shared inbox. Response times drifted past two days during peak weeks and nobody owned follow-up.

We introduced a triage rota, tagged escalations by product area, and routed each tag to a named owner with a daily review.

First response is now under four hours and every escalation has a visible owner.`,
  },
];

export default function SourceCard({
  mode,
  onModeChange,
  raw,
  onRawChange,
  onInlineImagesPasted,
  pastedImageCount,
  files,
  onFilesChange,
  disabled,
}: Props) {
  const ids = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const over = raw.length > MAX_CHARS;

  async function handleFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const staged = await readStagedFiles(picked);
    onFilesChange([...files, ...staged].slice(0, MAX_ITEMS));
    // Let the same file be chosen again after being removed.
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <section className="source-card">
      <header className="source-head">
        <h2>Content sources</h2>
        <div className="tab-row ml-auto" role="tablist" aria-label="Source type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "single"}
            onClick={() => onModeChange("single")}
          >
            Paste text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "batch"}
            onClick={() => onModeChange("batch")}
          >
            Upload files
          </button>
        </div>
      </header>

      <div className="source-body">
        {mode === "single" ? (
          <>
            <label className="sr-only" htmlFor={`${ids}-paste`}>
              Source content
            </label>
            <textarea
              id={`${ids}-paste`}
              className="source-textarea"
              value={raw}
              disabled={disabled}
              onChange={(e) => onRawChange(e.target.value)}
              onPaste={(e) => {
                // Images pasted alongside text are kept for the article template.
                void collectPastedInlineVisuals(e).then((visuals) => {
                  if (visuals.length > 0) onInlineImagesPasted(visuals);
                });
              }}
              placeholder="Paste a customer story, case study draft, project recap, newsletter, or meeting notes. The agent identifies the structure — goals, challenges, solutions and results — and prepares a draft for review."
            />
            <div className={`source-meta ${over ? "is-over" : ""}`}>
              <span>{FORMAT_HINT}</span>
              <span>
                {raw.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
                {pastedImageCount > 0 && ` · ${pastedImageCount} image${pastedImageCount === 1 ? "" : "s"} attached`}
              </span>
            </div>

            {raw.trim().length === 0 && (
              <div className="mt-3">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Start from an example
                </p>
                <div className="example-list">
                  {EXAMPLES.map((ex) => (
                    <button key={ex.label} type="button" onClick={() => onRawChange(ex.text)}>
                      <strong className="font-semibold text-ink">{ex.label}</strong> — loads
                      sample source text you can edit before analysing.
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <label className="field-label" htmlFor={`${ids}-files`}>
              Source files
            </label>
            <input
              ref={fileInput}
              id={`${ids}-files`}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              disabled={disabled}
              onChange={(e) => void handleFiles(e.target.files)}
              className="dropzone block w-full cursor-pointer text-[11px] text-ink-soft file:mr-3 file:rounded-[6px] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[10px] file:font-semibold file:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500/40"
            />
            <p className="mt-2 text-[9.5px] text-ink-mute">
              {FORMAT_HINT} Each file becomes its own production run.
            </p>

            {files.length > 0 && (
              <ul className="mt-3 grid gap-1.5">
                {files.map((f) => (
                  <li key={f.key} className={`file-row ${f.error ? "is-bad" : ""}`}>
                    <div className="min-w-0">
                      <strong className="truncate">{f.name}</strong>
                      <span>
                        {f.error ?? `${(f.rawContent?.length ?? 0).toLocaleString()} characters`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn quiet"
                      onClick={() => onFilesChange(files.filter((p) => p.key !== f.key))}
                    >
                      Remove<span className="sr-only"> {f.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
