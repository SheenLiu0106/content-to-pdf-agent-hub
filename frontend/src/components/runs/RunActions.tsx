import type { RunActionName } from "../../lib/api";
import { CONSEQUENCES, retryConsequences } from "../../lib/agentUx";
import type { RunStatus, Stage } from "../../lib/runTypes";

const NO_PAUSE: readonly RunStatus[] = ["APPROVED", "REJECTED", "FAILED"];

/**
 * Pause / resume / retry. Retry is only offered for FAILED — the server rejects it
 * anywhere else. Each control states its own semantics rather than relying on the
 * reviewer knowing them: a pause takes effect after the current stage, and a retry
 * resumes the stage that failed.
 */
export default function RunActions({
  status,
  paused,
  lastErrorStage,
  inFlight,
  onAction,
}: {
  status: RunStatus;
  paused: boolean;
  lastErrorStage: Stage | null;
  inFlight: RunActionName | null;
  onAction: (a: { action: "pause" } | { action: "resume" } | { action: "retry" }) => void;
}) {
  const busy = inFlight !== null;
  const canPause = !NO_PAUSE.includes(status);

  return (
    <>
      {canPause && (
        <button
          type="button"
          onClick={() => onAction({ action: paused ? "resume" : "pause" })}
          disabled={busy}
          className="btn"
          title={paused ? CONSEQUENCES.resume[0] : CONSEQUENCES.pause[0]}
        >
          {inFlight === "pause" || inFlight === "resume"
            ? "Working…"
            : paused
              ? "Resume agent"
              : "Pause agent after current stage"}
        </button>
      )}
      {status === "FAILED" && (
        <button
          type="button"
          onClick={() => onAction({ action: "retry" })}
          disabled={busy}
          className="btn dark"
          title={retryConsequences(lastErrorStage)[0]}
        >
          {inFlight === "retry" ? "Retrying…" : "Retry"}
        </button>
      )}
    </>
  );
}

/** The pause semantics, spelled out where there is room for a sentence. */
export function PauseNote() {
  return (
    <p className="text-[8.5px] leading-relaxed text-ink-mute">
      Pause stops the <strong className="font-semibold">next</strong> stage from starting.
      It does not cancel an LLM extraction or PDF render already running — work in flight
      still finishes and is saved. Resume lets the agent claim the next stage again.
    </p>
  );
}
