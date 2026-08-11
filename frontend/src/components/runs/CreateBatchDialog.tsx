import { useEffect, useId, useRef, useState } from "react";
import type { PdfRenderConfig } from "@shared/useCaseSchema";

import AgentScope from "../agent/AgentScope";
import BrandSettingsPanel from "../BrandSettingsPanel";
import TemplatePicker from "../create/TemplatePicker";
import * as api from "../../lib/api";
import { DEFAULT_CONFIG } from "../../lib/defaultConfig";
import { getTemplateDefinition, type TemplateId } from "../../lib/templates";
import {
  APPROVAL_MODE_LABELS,
  REVIEW_POLICY_LABELS,
  type ApprovalMode,
  type ReviewPolicy,
} from "../../lib/runTypes";
import {
  ACCEPT_ATTR,
  MAX_ITEMS,
  readStagedFiles,
  validStaged,
  type StagedFile,
} from "../../lib/stagedFiles";
import { BTN, Collapsible, INPUT, InlineNotice, LABEL } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the created runs once POST /api/runs succeeds. */
  onCreated: (result: api.CreateBatchResult) => void;
}

export default function CreateBatchDialog({ open, onClose, onCreated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  const [files, setFiles] = useState<StagedFile[]>([]);
  const [batchName, setBatchName] = useState("");
  const [reviewPolicy, setReviewPolicy] = useState<ReviewPolicy>("only_when_flagged");
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("required");
  const [config, setConfig] = useState<PdfRenderConfig>(DEFAULT_CONFIG);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Native modal: focus trap, Esc-to-close and focus restore come from the
  // platform rather than from a hand-rolled overlay.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const valid = validStaged(files);
  const rejected = files.filter((f) => f.error !== null);

  async function handleFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setReading(true);
    setError(null);
    const staged = await readStagedFiles(picked);
    setFiles((prev) => [...prev, ...staged].slice(0, MAX_ITEMS));
    setReading(false);
    // Let the same file be picked again after being removed.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (valid.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.createBatch(
        valid.map((f) => ({ name: f.name, rawContent: f.rawContent as string })),
        {
          ...(batchName.trim() ? { name: batchName.trim() } : {}),
          reviewPolicy,
          approvalMode,
          config,
        }
      );
      onCreated(result);
      setFiles([]);
      setBatchName("");
    } catch (err) {
      setError((err as api.ApiError).message ?? "The batch could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleTemplateChange(id: TemplateId) {
    setConfig((c) => ({
      ...c,
      templateId: id,
      documentLabel: getTemplateDefinition(id).documentLabel,
    }));
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${ids}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="w-[min(46rem,92vw)] rounded-[12px] border border-hair bg-shell-surface p-0 text-ink shadow-soft-lg backdrop:bg-[rgba(42,43,40,0.28)]"
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="border-b border-hair px-5 py-4">
          <h2 id={`${ids}-title`} className="text-base font-extrabold tracking-tight">
            New production batch
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
            Each file becomes one run. Extraction starts automatically; runs stop at
            the review gate when anything needs a human.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* -- files ------------------------------------------------------- */}
          <div>
            <label className={LABEL} htmlFor={`${ids}-files`}>
              Source files (.txt, .md)
            </label>
            <input
              ref={fileInputRef}
              id={`${ids}-files`}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              onChange={(e) => void handleFiles(e.target.files)}
              className="block w-full cursor-pointer rounded-[7px] border border-dashed border-hair-strong bg-shell-pane px-3 py-2.5 text-[12.5px] text-ink-soft file:mr-3 file:rounded-[6px] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500/40"
            />
            {reading && (
              <p role="status" className="mt-2 text-[12px] text-ink-mute">
                Reading files…
              </p>
            )}

            {files.length > 0 && (
              <ul className="mt-3 divide-y divide-hair-soft rounded-[7px] border border-hair">
                {files.map((f) => (
                  <li key={f.key} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink">
                        {f.name}
                      </p>
                      {f.error ? (
                        <p className="text-[11.5px] text-alert-ink">{f.error}</p>
                      ) : (
                        <p className="text-[11.5px] text-ink-mute">
                          {(f.rawContent?.length ?? 0).toLocaleString()} characters
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((p) => p.key !== f.key))}
                      className={BTN.quiet}
                    >
                      Remove<span className="sr-only"> {f.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {rejected.length > 0 && (
              <p className="mt-2 text-[12px] text-alert-ink">
                {rejected.length} file{rejected.length === 1 ? "" : "s"} will be skipped.
              </p>
            )}
          </div>

          {/* -- batch options ---------------------------------------------- */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL} htmlFor={`${ids}-name`}>
                Batch name
              </label>
              <input
                id={`${ids}-name`}
                type="text"
                value={batchName}
                maxLength={200}
                placeholder="Optional"
                onChange={(e) => setBatchName(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`${ids}-review`}>
                Review policy
              </label>
              <select
                id={`${ids}-review`}
                value={reviewPolicy}
                onChange={(e) => setReviewPolicy(e.target.value as ReviewPolicy)}
                className={INPUT}
              >
                {Object.entries(REVIEW_POLICY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor={`${ids}-approval`}>
                Approval mode
              </label>
              <select
                id={`${ids}-approval`}
                value={approvalMode}
                onChange={(e) => setApprovalMode(e.target.value as ApprovalMode)}
                className={INPUT}
              >
                <option value="required">{APPROVAL_MODE_LABELS.required}</option>
                {/* Accepted and persisted by the API, but the server refuses to act on
                    it until rendered-output QA exists — so it is visibly unavailable,
                    exactly as on the Create screen. */}
                <option value="auto_if_clean" disabled>
                  {APPROVAL_MODE_LABELS.auto_if_clean} — unavailable
                </option>
              </select>
            </div>
          </div>

          <AgentScope
            reviewPolicy={reviewPolicy}
            approvalMode={approvalMode}
            className="is-intake"
          />

          {/* -- render configuration --------------------------------------- */}
          <div className="border-t border-hair pt-3">
            <Collapsible summary="Render configuration (applies to every run in the batch)">
              <div className="space-y-5 pt-1">
                <TemplatePicker
                  selectedId={config.templateId}
                  onSelect={handleTemplateChange}
                />
                <BrandSettingsPanel config={config} onChange={setConfig} embedded />
              </div>
            </Collapsible>
          </div>

          {error && (
            <InlineNotice tone="danger" role="alert" title="Batch creation failed">
              {error}
            </InlineNotice>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-hair px-5 py-3.5">
          <p className="text-[12px] text-ink-mute">
            {valid.length} run{valid.length === 1 ? "" : "s"} will be created
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={BTN.secondary}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={valid.length === 0 || submitting || reading}
              className={BTN.accent}
            >
              {submitting ? "Creating…" : "Create batch"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
