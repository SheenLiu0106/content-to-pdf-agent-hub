import type { PdfRenderConfig, InlineVisualBlock } from "@shared/useCaseSchema";

import ErrorBanner from "../ErrorBanner";
import AgentProgress from "../agent/AgentProgress";
import AgentScope from "../agent/AgentScope";
import RunConfigPanel from "./RunConfigPanel";
import SourceCard, { type SourceMode } from "./SourceCard";
import type { TemplateId } from "../../lib/templates";
import { MIN_CHARS, validStaged, type StagedFile } from "../../lib/stagedFiles";
import { createStages, PHASE_LABELS } from "../../lib/agentUx";
import type { ApprovalMode, ReviewPolicy } from "../../lib/runTypes";

interface Props {
  mode: SourceMode;
  onModeChange: (next: SourceMode) => void;
  raw: string;
  onRawChange: (next: string) => void;
  onInlineImagesPasted: (visuals: InlineVisualBlock[]) => void;
  pastedImageCount: number;
  files: StagedFile[];
  onFilesChange: (next: StagedFile[]) => void;

  config: PdfRenderConfig;
  onConfigChange: (next: PdfRenderConfig) => void;
  onTemplateChange: (id: TemplateId) => void;
  runName: string;
  onRunNameChange: (next: string) => void;
  reviewPolicy: ReviewPolicy;
  onReviewPolicyChange: (next: ReviewPolicy) => void;
  approvalMode: ApprovalMode;
  onApprovalModeChange: (next: ApprovalMode) => void;

  /** True while the real extraction or batch-create request is in flight. */
  submitting: boolean;
  error: string | null;
  onDismissError: () => void;
  onSubmit: () => void;
  onClear: () => void;
  onGoToRuns: () => void;
}

/**
 * Run intake: source content plus the configuration a run needs before it starts.
 * Deliberately shows no document canvas — there is no document until the agent has
 * extracted one, and the Review workspace owns the canvas from then on.
 */
export default function CreateIntake({
  mode,
  onModeChange,
  raw,
  onRawChange,
  onInlineImagesPasted,
  pastedImageCount,
  files,
  onFilesChange,
  config,
  onConfigChange,
  onTemplateChange,
  runName,
  onRunNameChange,
  reviewPolicy,
  onReviewPolicyChange,
  approvalMode,
  onApprovalModeChange,
  submitting,
  error,
  onDismissError,
  onSubmit,
  onClear,
  onGoToRuns,
}: Props) {
  const ready =
    mode === "single" ? raw.trim().length >= MIN_CHARS : validStaged(files).length > 0;

  const hint = submitting
    ? mode === "single"
      ? "Analysing your source content…"
      : "Creating production runs…"
    : mode === "single"
      ? ready
        ? "The agent will extract a structured draft, then hand it to you for review."
        : `Add at least ${MIN_CHARS} characters of source content to continue.`
      : ready
        ? `${validStaged(files).length} run${validStaged(files).length === 1 ? "" : "s"} will be created and queued for extraction.`
        : "Add one or more .txt or .md files to continue.";

  return (
    <div className="intake-scroll">
      <header className="intake-head">
        <span className="eyebrow">New production run</span>
        <h1>Create with AI</h1>
        <p>
          Add your source content, define the intended output, and let the agent prepare a
          structured draft for review.
        </p>
        <div className="mt-3.5 flex items-center gap-2.5">
          <div className="mode-switch" role="group" aria-label="Run type">
            <button
              type="button"
              aria-pressed={mode === "single"}
              onClick={() => onModeChange("single")}
            >
              Single document
            </button>
            <button
              type="button"
              aria-pressed={mode === "batch"}
              onClick={() => onModeChange("batch")}
            >
              Batch upload
            </button>
          </div>
          <p className="max-w-xs text-[9.5px] leading-relaxed text-ink-mute">
            {mode === "single"
              ? "One document you review immediately."
              : "Each file becomes a durable production run with review and approval gates."}
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-4 max-w-3xl">
          <ErrorBanner message={error} onDismiss={onDismissError} />
        </div>
      )}

      <div className="intake-grid">
        <div className="min-w-0">
          <SourceCard
            mode={mode}
            onModeChange={onModeChange}
            raw={raw}
            onRawChange={onRawChange}
            onInlineImagesPasted={onInlineImagesPasted}
            pastedImageCount={pastedImageCount}
            files={files}
            onFilesChange={onFilesChange}
            disabled={submitting}
          />

          {submitting && (
            <div className="mt-3">
              {/*
                Real stages only. The single-document path is one server request that
                runs the whole agent pipeline, so it is reported as one activity — there
                is no per-stage signal to tick off, and inventing one would be a lie.
              */}
              <AgentProgress
                className="is-intake"
                phase={{ kind: "agent", label: PHASE_LABELS.agentWorking }}
                stages={createStages(mode, validStaged(files).length)}
                live
                headline={mode === "single" ? "Extraction in progress" : "Creating runs"}
                body={
                  mode === "single"
                    ? "The agent is calling the model now. On a long source this can take up to a minute, and it reports back only when the whole draft is ready."
                    : "Runs are created first, then a worker claims each one for extraction. The Runs workbench shows each run's real stage from then on."
                }
                pauseNote={
                  mode === "single"
                    ? "Nothing is saved or rendered yet — this step only produces a draft for you to edit."
                    : "Each run can be paused between stages once it exists."
                }
              />
            </div>
          )}
        </div>

        <div className="min-w-0">
          {/* Set expectations before any agent work starts, from the real policy below. */}
          <div className="mb-3">
            <AgentScope
              reviewPolicy={reviewPolicy}
              approvalMode={approvalMode}
              flow={mode === "single" ? "single" : "durable"}
              className="is-intake"
            />
          </div>
          <RunConfigPanel
            mode={mode}
            config={config}
            onConfigChange={onConfigChange}
            onTemplateChange={onTemplateChange}
            runName={runName}
            onRunNameChange={onRunNameChange}
            reviewPolicy={reviewPolicy}
            onReviewPolicyChange={onReviewPolicyChange}
            approvalMode={approvalMode}
            onApprovalModeChange={onApprovalModeChange}
            disabled={submitting}
          />
        </div>
      </div>

      <div className="intake-actions">
        <button
          type="button"
          className="btn accent"
          disabled={!ready || submitting}
          onClick={onSubmit}
        >
          {submitting
            ? mode === "single"
              ? "Analysing…"
              : "Creating…"
            : "Analyze and create draft"}
        </button>
        <button type="button" className="btn" onClick={onClear} disabled={submitting}>
          Clear
        </button>
        <button type="button" className="btn quiet" onClick={onGoToRuns} disabled={submitting}>
          Return to Runs
        </button>
        <p className="hint ml-auto max-w-md text-right">{hint}</p>
      </div>
    </div>
  );
}
