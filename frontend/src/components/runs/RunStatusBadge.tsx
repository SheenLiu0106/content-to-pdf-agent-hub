import { RUN_STATUS_LABELS, type RunStatus } from "../../lib/runTypes";

// Compact enamel pills. Colour is never the only carrier — each pill states its
// status in words, and the tones group the lifecycle families.
const TONE: Record<RunStatus, string> = {
  QUEUED: "t-draft",
  EXTRACTING: "t-running",
  REVIEW: "t-review",
  READY_TO_RENDER: "t-draft",
  RENDERING: "t-running",
  APPROVAL: "t-review",
  APPROVED: "t-ready",
  REJECTED: "t-draft",
  FAILED: "t-failed",
};

export default function RunStatusBadge({ status }: { status: RunStatus }) {
  return <span className={`status-pill ${TONE[status]}`}>{RUN_STATUS_LABELS[status]}</span>;
}

/** Paused is orthogonal to status, so it is always a separate pill. */
export function PausedBadge() {
  return <span className="status-pill t-paused">Paused</span>;
}
