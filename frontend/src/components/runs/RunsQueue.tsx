import { agentPhase } from "../../lib/agentUx";
import { formatTime, type RunSummary } from "../../lib/runTypes";
import RunStatusBadge, { PausedBadge } from "./RunStatusBadge";
import StageTrack, { stageLabel, stageProgress } from "./StageTrack";

interface Props {
  runs: RunSummary[];
  selectedRunId: string | null;
  onOpen: (runId: string) => void;
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * The production queue: document rows on warm trays. A real table with header cells,
 * and exactly one keyboard-reachable Open control per row — rows are not buttons.
 */
export default function RunsQueue({ runs, selectedRunId, onOpen }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="queue">
        <caption className="sr-only">
          Production runs, with status, stage, blocking issues and attempt counts.
        </caption>
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Status</th>
            <th scope="col">Stage</th>
            <th scope="col">Blocking</th>
            <th scope="col">Extract</th>
            <th scope="col">Render</th>
            <th scope="col">Updated</th>
            <th scope="col" className="text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className={run.id === selectedRunId ? "is-selected" : undefined}>
              <td>
                <span className="doc-cell">
                  <span className="doc-icon" aria-hidden="true" />
                  <span className="min-w-0">
                    <strong title={run.name} className="truncate">
                      {run.name}
                    </strong>
                    <small>
                      Batch <span className="font-mono">{shortId(run.batchId)}</span> ·{" "}
                      {formatTime(run.createdAt)}
                    </small>
                  </span>
                </span>
              </td>
              <td>
                <span className="flex flex-wrap items-center gap-1.5">
                  <RunStatusBadge status={run.status} />
                  {run.paused && <PausedBadge />}
                </span>
              </td>
              <td>
                <strong className="stage-label">{stageLabel(run.status)}</strong>
                <span className="progress-mini">
                  <span style={{ width: `${Math.round(stageProgress(run.status) * 100)}%` }} />
                </span>
                {/* Who the run is waiting on, in the same words the workspace uses. */}
                <small className="queue-phase">{agentPhase(run.status, run.paused).label}</small>
              </td>
              <td>
                {run.openBlockingCount > 0 ? (
                  <strong className="text-ember-600">
                    {run.openBlockingCount} open
                  </strong>
                ) : (
                  <span className="text-ink-faint">None</span>
                )}
              </td>
              <td className="tabular-nums">
                {run.extractAttempts}
                <span className="sr-only"> extraction attempts</span>
              </td>
              <td className="tabular-nums">
                {run.renderAttempts}
                <span className="sr-only"> render attempts</span>
              </td>
              <td className="whitespace-nowrap">{formatTime(run.updatedAt)}</td>
              <td className="text-right">
                <button type="button" onClick={() => onOpen(run.id)} className="btn sm">
                  Open<span className="sr-only"> run {run.name}</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { StageTrack };
