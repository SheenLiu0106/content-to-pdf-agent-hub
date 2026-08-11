import {
  formatTime,
  RUN_STATUS_DESCRIPTIONS,
  RUN_STATUS_LABELS,
  type RunSummary,
} from "../../lib/runTypes";

/**
 * Recent run updates, ordered by the API's own `updatedAt`.
 *
 * Real records, not a synthesized agent feed: the list projection carries no
 * run_events, so this reports what actually changed and when. Per-run event history
 * lives on the run detail, which does return events.
 */
export default function RecentActivity({
  runs,
  onOpen,
}: {
  runs: RunSummary[];
  onOpen: (runId: string) => void;
}) {
  const recent = [...runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Recent run updates</h2>
          <p className="card-sub">Latest state change per run.</p>
        </div>
      </div>
      <div className="card-body pt-1">
        {recent.length === 0 ? (
          <p className="text-[10px] text-ink-mute">No activity yet.</p>
        ) : (
          recent.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onOpen(run.id)}
              className="activity-item"
            >
              <span className="activity-icon" aria-hidden="true">
                {run.status === "FAILED" ? "✕" : run.openBlockingCount > 0 ? "!" : "•"}
              </span>
              <span className="min-w-0">
                <strong className="truncate">{run.name}</strong>
                <p>
                  {RUN_STATUS_LABELS[run.status]} ·{" "}
                  {run.lastError && run.status === "FAILED"
                    ? run.lastError
                    : run.openBlockingCount > 0
                      ? `${run.openBlockingCount} blocking issue${run.openBlockingCount === 1 ? "" : "s"} open`
                      : RUN_STATUS_DESCRIPTIONS[run.status]}
                </p>
                <time>{formatTime(run.updatedAt)}</time>
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
