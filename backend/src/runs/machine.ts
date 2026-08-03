// The state machine: legality table, executable guards, and issue derivation.
//
// Pure by construction — no store, no filesystem, no config. Anything that needs
// I/O (re-hashing the artifact on disk, counting open blocking issues) is passed
// in by the caller, which lets every guard be unit-tested directly and keeps the
// checks atomic with the caller's transaction.

import { validateRenderContentStructured } from "../shared/normalizeUseCase.js";
import type { PdfRenderConfig, UseCase } from "../shared/useCaseSchema.js";
import type { PdfQualityReport } from "../shared/agentTypes.js";
import {
  MAX_EXTRACT_ATTEMPTS,
  MAX_RENDER_ATTEMPTS,
} from "./store.js";
import {
  type ApprovalMode,
  type DetectedIssue,
  type QaCheck,
  type QaReport,
  type QaVerdict,
  type ReviewPolicy,
  type Run,
  type RunAction,
  type RunStatus,
  type Stage,
} from "./types.js";

// ---------------------------------------------------------------------------
// Guard results
// ---------------------------------------------------------------------------

export type GuardResult =
  | { ok: true }
  | { ok: false; code: GuardFailureCode; message: string; detail?: Record<string, unknown> };

export type GuardFailureCode =
  | "illegal_transition"
  | "wrong_state"
  | "blocking_issues_open"
  | "fingerprint_mismatch"
  | "artifact_missing"
  | "artifact_mismatch"
  | "artifact_fingerprint_stale"
  | "qa_failed"
  | "auto_approval_disabled";

const OK: GuardResult = { ok: true };

function fail(
  code: GuardFailureCode,
  message: string,
  detail?: Record<string, unknown>
): GuardResult {
  return { ok: false, code, message, detail };
}

// ---------------------------------------------------------------------------
// Legality table
// ---------------------------------------------------------------------------

// Every status change must appear here. This is legality only — the guards below
// decide whether a legal transition is actually permitted right now.
export const ALLOWED_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  QUEUED: ["EXTRACTING"],
  EXTRACTING: ["REVIEW", "READY_TO_RENDER", "QUEUED", "FAILED"],
  REVIEW: ["READY_TO_RENDER", "REJECTED"],
  READY_TO_RENDER: ["RENDERING"],
  // No RENDERING -> FAILED for correctable problems: render-validation and QA
  // failures route to REVIEW. FAILED is infrastructure only.
  RENDERING: ["APPROVAL", "REVIEW", "READY_TO_RENDER", "FAILED"],
  APPROVAL: ["APPROVED", "REVIEW", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
  FAILED: ["QUEUED", "READY_TO_RENDER"],
};

export function isLegalTransition(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertLegalTransition(from: RunStatus, to: RunStatus): GuardResult {
  return isLegalTransition(from, to)
    ? OK
    : fail("illegal_transition", `${from} -> ${to} is not a legal transition.`, {
        from,
        to,
      });
}

// ---------------------------------------------------------------------------
// Post-extraction routing
// ---------------------------------------------------------------------------

/**
 * Where a run goes after a successful extraction.
 *
 * The review gate is entered whenever ANY open blocking issue exists, regardless
 * of policy — `only_when_flagged` may skip review only when the blocking set is
 * empty. This is not bypassable by configuration.
 */
export function nextAfterExtract(
  reviewPolicy: ReviewPolicy,
  openBlocking: number
): Extract<RunStatus, "REVIEW" | "READY_TO_RENDER"> {
  if (openBlocking > 0) return "REVIEW";
  return reviewPolicy === "always" ? "REVIEW" : "READY_TO_RENDER";
}

/** A retry resumes the stage that failed — a render retry never re-extracts. */
export function retryTarget(lastErrorStage: Stage | null): Extract<RunStatus, "QUEUED" | "READY_TO_RENDER"> {
  return lastErrorStage === "render" ? "READY_TO_RENDER" : "QUEUED";
}

export function maxAttemptsFor(stage: Stage): number {
  return stage === "extract" ? MAX_EXTRACT_ATTEMPTS : MAX_RENDER_ATTEMPTS;
}

export function attemptsFor(run: Run, stage: Stage): number {
  return stage === "extract" ? run.extractAttempts : run.renderAttempts;
}

/** Retryable failures are transient provider/infra errors, not contract violations. */
export function shouldRetry(run: Run, stage: Stage, retryableKind: boolean): boolean {
  return retryableKind && attemptsFor(run, stage) < maxAttemptsFor(stage);
}

// ---------------------------------------------------------------------------
// Gate guards
// ---------------------------------------------------------------------------

export interface ReviewGateContext {
  run: Run;
  /** Re-read inside the decision transaction, never taken from the request. */
  openBlocking: number;
  /** Computed live from the stored content+config inside the transaction. */
  currentFingerprint: string;
  expectedFingerprint: string;
}

/** Transition 6: REVIEW -> READY_TO_RENDER. */
export function canApproveReviewGate(ctx: ReviewGateContext): GuardResult {
  if (ctx.run.status !== "REVIEW") {
    return fail("wrong_state", `Review approval requires status REVIEW (is ${ctx.run.status}).`, {
      status: ctx.run.status,
    });
  }
  if (ctx.expectedFingerprint !== ctx.currentFingerprint) {
    return fail(
      "fingerprint_mismatch",
      "The draft changed since you loaded it. Reload and review the current content.",
      { currentFingerprint: ctx.currentFingerprint }
    );
  }
  if (ctx.openBlocking > 0) {
    return fail(
      "blocking_issues_open",
      `${ctx.openBlocking} blocking issue${ctx.openBlocking === 1 ? "" : "s"} must be resolved or waived first.`,
      { openBlocking: ctx.openBlocking }
    );
  }
  return OK;
}

export interface FinalApprovalContext {
  run: Run;
  openBlocking: number;
  currentFingerprint: string;
  expectedFingerprint: string;
  expectedArtifactSha256: string;
  /** sha256 of the file actually on disk, or null when it is missing. */
  artifactOnDiskSha256: string | null;
}

/** Transition 14: APPROVAL -> APPROVED by a human. */
export function canApproveFinal(ctx: FinalApprovalContext): GuardResult {
  const { run } = ctx;

  if (run.status !== "APPROVAL") {
    return fail("wrong_state", `Final approval requires status APPROVAL (is ${run.status}).`, {
      status: run.status,
    });
  }

  if (!run.pdfPath || !run.artifactSha256 || !run.renderedFingerprint) {
    return fail("artifact_missing", "This run has no active rendered artifact to approve.");
  }

  if (ctx.artifactOnDiskSha256 === null) {
    return fail("artifact_missing", "The rendered PDF is no longer present on disk.");
  }

  // Re-hash rather than trusting existsSync: a corrupted or swapped file must not
  // be signable.
  if (ctx.artifactOnDiskSha256 !== run.artifactSha256) {
    return fail(
      "artifact_mismatch",
      "The rendered PDF on disk does not match the recorded artifact hash.",
      { recorded: run.artifactSha256, onDisk: ctx.artifactOnDiskSha256 }
    );
  }

  if (ctx.expectedArtifactSha256 !== run.artifactSha256) {
    return fail(
      "fingerprint_mismatch",
      "The artifact changed since you loaded it. Reload before approving.",
      { currentArtifactSha256: run.artifactSha256 }
    );
  }

  if (ctx.expectedFingerprint !== ctx.currentFingerprint) {
    return fail(
      "fingerprint_mismatch",
      "The content changed since you loaded it. Reload before approving.",
      { currentFingerprint: ctx.currentFingerprint }
    );
  }

  // The artifact must still correspond to the stored content+config. Editing
  // after render invalidates the thing being signed.
  if (ctx.currentFingerprint !== run.renderedFingerprint) {
    return fail(
      "artifact_fingerprint_stale",
      "The content has changed since this PDF was rendered. Request changes and re-render.",
      { renderedFingerprint: run.renderedFingerprint, currentFingerprint: ctx.currentFingerprint }
    );
  }

  if (run.qa?.verdict === "fail") {
    return fail("qa_failed", "Output QA failed for this artifact; it cannot be approved.");
  }

  if (ctx.openBlocking > 0) {
    return fail(
      "blocking_issues_open",
      `${ctx.openBlocking} blocking issue${ctx.openBlocking === 1 ? "" : "s"} must be resolved or waived first.`,
      { openBlocking: ctx.openBlocking }
    );
  }

  return OK;
}

export interface AutoApprovalContext {
  run: Run;
  openBlocking: number;
  currentFingerprint: string;
  artifactOnDiskSha256: string | null;
  /** Phase 1: false. Flips only when Phase 3 rendered-output QA ships. */
  renderQaEnabled: boolean;
}

/**
 * Transition 15: automatic APPROVAL -> APPROVED.
 *
 * Disabled in Phase 1. `approval_mode` is persisted and accepted, but pre-render
 * heuristics must never finalize a customer-facing document, so this returns
 * false until RENDER_QA_ENABLED is turned on by Phase 3.
 */
export function canAutoApprove(ctx: AutoApprovalContext): GuardResult {
  if (!ctx.renderQaEnabled) {
    return fail(
      "auto_approval_disabled",
      "Automatic approval is disabled until rendered-output QA is implemented and validated."
    );
  }
  if (ctx.run.approvalMode !== "auto_if_clean") {
    return fail("auto_approval_disabled", "This run requires human approval.");
  }
  if (ctx.run.qa?.verdict !== "pass") {
    return fail("qa_failed", "Automatic approval requires a clean QA pass.");
  }
  // Everything the human path checks, checked identically.
  return canApproveFinal({
    run: ctx.run,
    openBlocking: ctx.openBlocking,
    currentFingerprint: ctx.currentFingerprint,
    expectedFingerprint: ctx.currentFingerprint,
    expectedArtifactSha256: ctx.run.artifactSha256 ?? "",
    artifactOnDiskSha256: ctx.artifactOnDiskSha256,
  });
}

// ---------------------------------------------------------------------------
// Action permissions
// ---------------------------------------------------------------------------

export type ActionName = RunAction["action"];

// Editing is confined to REVIEW. At APPROVAL you must request_changes first,
// which makes an approval-gate content edit structurally impossible rather than
// merely guarded against.
export const ACTION_ALLOWED_IN: Record<ActionName, readonly RunStatus[]> = {
  update_content: ["REVIEW"],
  update_config: ["REVIEW"],
  waive_issue: ["REVIEW"],
  approve_gate: ["REVIEW", "APPROVAL"],
  request_changes: ["APPROVAL"],
  reject: ["REVIEW", "APPROVAL"],
  retry: ["FAILED"],
  // Pause composes with every non-terminal state.
  pause: ["QUEUED", "EXTRACTING", "REVIEW", "READY_TO_RENDER", "RENDERING", "APPROVAL"],
  resume: ["QUEUED", "EXTRACTING", "REVIEW", "READY_TO_RENDER", "RENDERING", "APPROVAL"],
};

export function isActionAllowed(action: RunAction, run: Run): GuardResult {
  const allowed = ACTION_ALLOWED_IN[action.action];
  if (!allowed.includes(run.status)) {
    const hint =
      (action.action === "update_content" || action.action === "update_config") &&
      run.status === "APPROVAL"
        ? " Use request_changes first to return the run to REVIEW."
        : "";
    return fail(
      "wrong_state",
      `Action "${action.action}" is not allowed while the run is ${run.status}.${hint}`,
      { status: run.status, allowed: [...allowed] }
    );
  }

  // approve_gate carries its own gate, which must match the run's actual state.
  if (action.action === "approve_gate") {
    const expected: RunStatus = action.gate === "review" ? "REVIEW" : "APPROVAL";
    if (run.status !== expected) {
      return fail(
        "wrong_state",
        `Gate "${action.gate}" requires status ${expected} (is ${run.status}).`,
        { status: run.status, expected }
      );
    }
  }

  return OK;
}

// ---------------------------------------------------------------------------
// Issue derivation
// ---------------------------------------------------------------------------

export interface DeriveIssuesInput {
  content: UseCase;
  config: PdfRenderConfig;
  /** Present once the render stage has produced one. */
  qualityReport?: PdfQualityReport | null;
  /** Intake risks captured at extraction. */
  intakeRisks?: string[];
}

/**
 * Map the signals that ALREADY exist in this codebase onto issues. No new
 * detectors are invented here.
 *
 * Note on `source_expansion`: it reflects content the LLM added beyond the
 * source. It is NOT a claim-grounding result — no such detector exists in this
 * repo — so it is treated conservatively as blocking. With the default
 * EXPANSION_MODE=standard most runs will carry these, which is why
 * `only_when_flagged` behaves close to `always`; EXPANSION_MODE=strict is the
 * global escape hatch and waiving is the per-run one.
 */
export function deriveIssues(input: DeriveIssuesInput): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  for (const v of validateRenderContentStructured(input.content, {
    templateId: input.config.templateId,
  })) {
    issues.push({
      code: "render_validation",
      severity: "blocking",
      source: "render_validation",
      // Structural coordinate, derived from the validator's own fields rather
      // than parsed out of the message.
      locator: `summary.${v.section}.${v.kind}`,
      message: v.message,
      detail: `observed=${v.observed}`,
    });
  }

  for (const [i, note] of (input.content.expansionNotes ?? []).entries()) {
    issues.push({
      code: "source_expansion",
      severity: "blocking",
      source: "extraction",
      locator: `expansionNotes.${i}`,
      message: note,
    });
  }

  for (const [i, field] of (input.content.missingFields ?? []).entries()) {
    issues.push({
      code: "missing_field",
      severity: "warning",
      source: "extraction",
      locator: `missingFields.${i}`,
      message: `Source did not supply: ${field}`,
    });
  }

  for (const [i, risk] of (input.intakeRisks ?? []).entries()) {
    issues.push({
      code: "intake_risk",
      severity: "warning",
      source: "intake",
      locator: `intakeRisks.${i}`,
      message: risk,
    });
  }

  for (const issue of input.qualityReport?.issues ?? []) {
    issues.push({
      code: issue.severity === "error" ? "quality_error" : "quality_warning",
      severity: issue.severity === "error" ? "blocking" : "warning",
      source: "quality_review",
      locator: `quality.${issue.location ?? "document"}.${issue.code}`,
      message: issue.message,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// QA report
// ---------------------------------------------------------------------------

function worstVerdict(checks: QaCheck[]): QaVerdict {
  if (checks.some((c) => c.verdict === "fail")) return "fail";
  if (checks.some((c) => c.verdict === "warn")) return "warn";
  return "pass";
}

/**
 * Build the QA report from the pre-render quality review that runRenderAgent
 * already produces.
 *
 * Phase 1 emits ONLY stage:'pre_render'. Nothing here observes the produced PDF
 * bytes or the rendered layout — that is Phase 3's `stage:'render'` work, and the
 * reason auto-approval stays disabled.
 */
export function buildQaReport(report: PdfQualityReport | null | undefined): QaReport {
  // Every pre-render finding is at most a 'warn' here. Severity is carried by the
  // ISSUE (an error-level finding becomes a blocking issue and gates the review
  // gate); a pre-render heuristic must not mark the artifact itself as failed.
  // 'fail' is reserved for Phase 3 checks that actually inspect the output.
  const checks: QaCheck[] = (report?.issues ?? []).map((issue) => ({
    stage: "pre_render",
    code: issue.code,
    verdict: "warn" as const,
    message: issue.message,
  }));

  if (checks.length === 0) {
    checks.push({
      stage: "pre_render",
      code: "pre_render_clean",
      verdict: "pass",
      message: "Pre-render quality review found no issues.",
    });
  }

  return { verdict: worstVerdict(checks), checks };
}

export function approvalModeAllowsAuto(mode: ApprovalMode, renderQaEnabled: boolean): boolean {
  return renderQaEnabled && mode === "auto_if_clean";
}
