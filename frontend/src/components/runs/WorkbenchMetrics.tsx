import type { RunStatus, RunSummary } from "../../lib/runTypes";
import type { StatusFilter } from "../../hooks/useRuns";

// Every number is counted from the RunSummary records the API returned. No stored
// aggregates, no trends, no time-window claims the data cannot support.
const IN_FLIGHT: readonly RunStatus[] = ["QUEUED", "EXTRACTING", "READY_TO_RENDER", "RENDERING"];

interface Metric {
  key: string;
  label: string;
  scope: string;
  value: number;
  note: string;
  filter: StatusFilter;
  accent?: boolean;
}

export default function WorkbenchMetrics({
  runs,
  statusFilter,
  onFilter,
}: {
  runs: RunSummary[];
  statusFilter: StatusFilter;
  onFilter: (next: StatusFilter) => void;
}) {
  const count = (fn: (r: RunSummary) => boolean) => runs.filter(fn).length;
  const review = count((r) => r.status === "REVIEW");
  const approval = count((r) => r.status === "APPROVAL");
  const failed = count((r) => r.status === "FAILED");
  const paused = count((r) => r.paused);
  const blocking = runs.reduce((sum, r) => sum + r.openBlockingCount, 0);

  const metrics: Metric[] = [
    {
      key: "active",
      label: "Agent in flight",
      scope: "Live",
      value: count((r) => IN_FLIGHT.includes(r.status)),
      note: paused > 0 ? `${paused} paused` : "Extract and render stages",
      filter: "ALL",
    },
    {
      key: "review",
      label: "Awaiting review",
      scope: "Human gate",
      value: review,
      note:
        blocking > 0
          ? `${blocking} blocking issue${blocking === 1 ? "" : "s"} open`
          : "No blocking issues open",
      filter: "REVIEW",
      accent: review > 0,
    },
    {
      key: "approval",
      label: "Awaiting approval",
      scope: "Human gate",
      value: approval,
      note: "Rendered PDFs needing sign-off",
      filter: "APPROVAL",
      accent: approval > 0,
    },
    {
      key: "closed",
      label: "Approved",
      scope: "Signed",
      value: count((r) => r.status === "APPROVED"),
      note: failed > 0 ? `${failed} failed run${failed === 1 ? "" : "s"}` : "Signed and closed",
      filter: "APPROVED",
    },
  ];

  return (
    <ul className="stat-grid">
      {metrics.map((m) => {
        const active = statusFilter === m.filter && m.filter !== "ALL";
        return (
          <li key={m.key}>
            <button
              type="button"
              onClick={() => onFilter(active ? "ALL" : m.filter)}
              aria-pressed={active}
              className={`stat-card ${active ? "is-active" : ""}`}
            >
              <span className="stat-top">
                <span>{m.label}</span>
                <span>{active ? "Filtered" : m.scope}</span>
              </span>
              <strong className={`stat-value ${m.accent ? "is-accent" : ""}`}>{m.value}</strong>
              <span className="stat-note">{m.note}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
