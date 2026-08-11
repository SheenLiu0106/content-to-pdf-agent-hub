// Types for the production-run API. Re-exported (type-only, so nothing from the
// backend is bundled) from the run store's own definitions — the server is
// authoritative and a second hand-written copy would drift.
//
// Everything below the re-exports is presentation-only: readable labels and
// humanizers. Deliberately NOT a transition map — the frontend never decides
// what a run may do next, it reads `status` and handles 409s.

export type {
  ApprovalMode,
  ApprovalRecord,
  Decision,
  Gate,
  IssueSeverity,
  IssueSource,
  IssueStatus,
  QaCheck,
  QaReport,
  QaVerdict,
  ReviewPolicy,
  Run,
  RunAgentSnapshot,
  RunEvent,
  RunEventType,
  RunIssue,
  RunStatus,
  RunSummary,
  Stage,
} from "../../../backend/src/runs/types";

import type { RunEventType, RunStatus } from "../../../backend/src/runs/types";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Display order for filters — mirrors the lifecycle, not the enum. */
export const RUN_STATUS_ORDER: readonly RunStatus[] = [
  "QUEUED",
  "EXTRACTING",
  "REVIEW",
  "READY_TO_RENDER",
  "RENDERING",
  "APPROVAL",
  "APPROVED",
  "REJECTED",
  "FAILED",
];

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  QUEUED: "Queued",
  EXTRACTING: "Extracting",
  REVIEW: "Needs review",
  READY_TO_RENDER: "Ready to render",
  RENDERING: "Rendering",
  APPROVAL: "Needs approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  FAILED: "Failed",
};

/** What each status means, so the durable workflow reads as a workflow. */
export const RUN_STATUS_DESCRIPTIONS: Record<RunStatus, string> = {
  QUEUED: "Waiting for an agent worker to start extraction.",
  EXTRACTING: "An agent is extracting structured content from the source.",
  REVIEW: "Waiting for a reviewer to resolve issues and approve the draft.",
  READY_TO_RENDER: "Review approved. Waiting for a worker to render the PDF.",
  RENDERING: "An agent is rendering the PDF.",
  APPROVAL: "A rendered PDF is waiting for final sign-off.",
  APPROVED: "Signed off. The PDF is final and the run is closed.",
  REJECTED: "Rejected by a reviewer. This run cannot be resumed.",
  FAILED: "Stopped by an infrastructure failure or exhausted retries. Retry to resume the stage that failed.",
};

/**
 * Whether the server is expected to move this run on its own.
 *
 * - QUEUED polls unconditionally.
 * - READY_TO_RENDER polls only while not paused.
 * - EXTRACTING/RENDERING poll even when a pause has been requested: pause stops
 *   the *next* stage, so a stage already in flight will still commit and change
 *   the status.
 * - REVIEW/APPROVAL wait on a human, FAILED moves only on a manual retry (which
 *   refreshes directly), and APPROVED/REJECTED are terminal. None of them poll.
 */
export function isPollable(status: RunStatus, paused: boolean): boolean {
  if (status === "QUEUED" || status === "EXTRACTING" || status === "RENDERING") return true;
  if (status === "READY_TO_RENDER") return !paused;
  return false;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const RUN_EVENT_LABELS: Record<RunEventType, string> = {
  claimed: "Agent started the stage",
  transition: "Run moved to the next stage",
  retry_scheduled: "Retry scheduled",
  recovered: "Interrupted run recovered",
  issue_opened: "Review issue detected",
  issue_reopened: "Review issue reopened",
  issue_resolved: "Review issue resolved",
  issue_waived: "Issue waived by reviewer",
  issue_auto_cleared: "Issue cleared automatically",
  decision: "Human decision recorded",
  render_committed: "PDF artifact created",
  render_discarded: "Rendered PDF discarded",
  paused: "Run paused",
  resumed: "Run resumed",
  failed: "Run failed",
};

/** 'worker:1234' | 'user:Dana' | 'system' -> something a reviewer can read. */
export function formatActor(actor: string): string {
  if (actor.startsWith("user:")) return actor.slice(5);
  if (actor.startsWith("worker:")) return `Agent worker ${actor.slice(7)}`;
  if (actor === "user") return "Reviewer";
  if (actor === "system") return "System";
  return actor;
}

// ---------------------------------------------------------------------------
// Issue locators
// ---------------------------------------------------------------------------

// Locators are structural coordinates like "summary.solutions.bullet_count_exact"
// or "expansionNotes.0". The first segment names the family; the rest are section
// names, indexes or check codes.
const LOCATOR_HEADS: Record<string, string> = {
  summary: "Summary",
  expansionNotes: "Content added beyond the source",
  missingFields: "Missing from the source",
  intakeRisks: "Intake risk",
  quality: "Quality review",
};

function humanizeSegment(segment: string): string {
  if (/^\d+$/.test(segment)) return `#${Number(segment) + 1}`;
  const spaced = segment.replace(/[_-]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** "summary.solutions.bullet_count_exact" -> "Summary · Solutions · Bullet count exact". */
export function humanizeLocator(locator: string): string {
  const [head, ...rest] = locator.split(".");
  const parts = [LOCATOR_HEADS[head] ?? humanizeSegment(head), ...rest.map(humanizeSegment)];
  return parts.filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// Misc labels
// ---------------------------------------------------------------------------

export const ISSUE_SEVERITY_LABELS = {
  blocking: "Blocking",
  warning: "Warning",
  info: "Info",
} as const;

export const ISSUE_STATUS_LABELS = {
  open: "Open",
  resolved: "Resolved",
  waived: "Waived",
} as const;

export const ISSUE_SOURCE_LABELS = {
  render_validation: "Render validation",
  quality_review: "Quality review",
  extraction: "Extraction",
  intake: "Intake",
} as const;

export const QA_VERDICT_LABELS = {
  pass: "Pass",
  warn: "Warnings",
  fail: "Fail",
} as const;

export const GATE_LABELS = { review: "Review gate", approval: "Final approval" } as const;

export const DECISION_LABELS = {
  approve: "Approved",
  request_changes: "Changes requested",
  reject: "Rejected",
} as const;

export const REVIEW_POLICY_LABELS = {
  only_when_flagged: "Review only when flagged",
  always: "Always review",
} as const;

export const APPROVAL_MODE_LABELS = {
  required: "Human approval required",
  auto_if_clean: "Auto-approve when clean",
} as const;

/** Absolute-safe short timestamp; run timestamps are ISO strings from SQLite. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
