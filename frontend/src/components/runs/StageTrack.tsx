import type { RunStatus } from "../../lib/runTypes";

// The real lifecycle, collapsed to the five phases a reviewer thinks in. This is a
// read-only projection of run.status for display — it decides nothing and never
// drives a transition, so it cannot drift from the backend state machine.
const PHASES = [
  { key: "source", label: "Source", statuses: ["QUEUED"] },
  { key: "extract", label: "Extract", statuses: ["EXTRACTING"] },
  { key: "review", label: "Review", statuses: ["REVIEW"] },
  { key: "render", label: "Render", statuses: ["READY_TO_RENDER", "RENDERING"] },
  { key: "approve", label: "Approve", statuses: ["APPROVAL", "APPROVED"] },
] as const;

/** Index of the phase a status sits in. REJECTED/FAILED are handled separately. */
function phaseIndex(status: RunStatus): number {
  const i = PHASES.findIndex((p) => (p.statuses as readonly string[]).includes(status));
  return i === -1 ? 0 : i;
}

export function stageLabel(status: RunStatus): string {
  if (status === "FAILED") return "Failed";
  if (status === "REJECTED") return "Rejected";
  return PHASES[phaseIndex(status)].label;
}

/** Completed fraction, for the queue's compact meter. */
export function stageProgress(status: RunStatus): number {
  if (status === "APPROVED") return 1;
  if (status === "REJECTED" || status === "FAILED") return phaseIndex(status) / PHASES.length;
  return (phaseIndex(status) + 0.5) / PHASES.length;
}

export default function StageTrack({ status }: { status: RunStatus }) {
  const current = phaseIndex(status);
  const failed = status === "FAILED";
  const terminal = status === "REJECTED";
  const approved = status === "APPROVED";

  return (
    <ol className="stage-track" aria-label="Run lifecycle">
      {PHASES.map((phase, i) => {
        const done = approved || i < current;
        const isCurrent = !approved && i === current;
        const cls = [
          "stage-step",
          done ? "is-done" : "",
          isCurrent && failed ? "is-failed" : isCurrent && terminal ? "is-terminal" : "",
          isCurrent && !failed && !terminal ? "is-current" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <li key={phase.key} className={cls} aria-current={isCurrent ? "step" : undefined}>
            {phase.label}
          </li>
        );
      })}
    </ol>
  );
}
