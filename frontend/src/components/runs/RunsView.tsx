import { useEffect, useMemo, useState } from "react";

import AppShell from "../shell/AppShell";
import type { AppView } from "../shell/SideNav";
import type * as api from "../../lib/api";
import { RUN_STATUS_LABELS, RUN_STATUS_ORDER, type RunStatus } from "../../lib/runTypes";
import { useRuns, type StatusFilter } from "../../hooks/useRuns";
import CreateBatchDialog from "./CreateBatchDialog";
import RecentActivity from "./RecentActivity";
import RunDetail from "./RunDetail";
import RunsQueue from "./RunsQueue";
import WorkbenchMetrics from "./WorkbenchMetrics";
import { EmptyState, InlineNotice } from "./ui";

interface Props {
  view: AppView;
  onViewChange: (next: AppView) => void;
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
}

/** The production workbench: metrics and the run queue, or one run's workspace. */
export default function RunsView({
  view,
  onViewChange,
  reviewerName,
  onReviewerNameChange,
}: Props) {
  const { runs, loading, refreshing, error, reload, statusFilter, setStatusFilter } = useRuns();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [created, setCreated] = useState<api.CreateBatchResult | null>(null);
  const [query, setQuery] = useState("");

  // Real client-side filter over the records already loaded — not a decorative box.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter(
      (r) => r.name.toLowerCase().includes(q) || r.batchId.toLowerCase().includes(q)
    );
  }, [runs, query]);

  const selected = runs.find((r) => r.id === selectedRunId);

  return (
    <AppShell
      view={view}
      onViewChange={onViewChange}
      activeRun={selected ? { id: selected.id, name: selected.name } : null}
      onActiveRunClick={() => selected && setSelectedRunId(selected.id)}
      reviewerName={reviewerName}
      onReviewerNameChange={onReviewerNameChange}
      crumbs={["Runs", selectedRunId ? (selected?.name ?? "Run") : "Workbench"]}
      search={
        !selectedRunId ? (
          <label className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter runs by name or batch"
              aria-label="Filter runs by name or batch"
            />
          </label>
        ) : null
      }
      status={
        refreshing ? (
          <span role="status" className="text-[9px] text-ink-faint">
            Refreshing…
          </span>
        ) : null
      }
      action={
        selectedRunId ? (
          <button type="button" onClick={() => setSelectedRunId(null)} className="btn">
            All runs
          </button>
        ) : (
          <button type="button" onClick={() => setDialogOpen(true)} className="btn accent">
            + New production run
          </button>
        )
      }
    >
      {selectedRunId ? (
        <RunDetail
          runId={selectedRunId}
          reviewerName={reviewerName}
          onReviewerNameChange={onReviewerNameChange}
          onBack={() => setSelectedRunId(null)}
          onRunChanged={reload}
        />
      ) : (
        <div className="content-scroll">
          <div className="page-head">
            <div>
              <span className="eyebrow">Document production workspace</span>
              <h1 className="page-title">Turn approved content into publication-ready PDFs.</h1>
              <p className="page-sub">
                Every run is a durable job: the agent extracts structure, pauses at the
                review gate, renders the PDF, then waits for a human to sign the artifact.
                Nothing ships without that decision.
              </p>
            </div>
            <div className="flex shrink-0 items-end gap-2">
              <div>
                <label className="field-label" htmlFor="runs-status-filter">
                  Status
                </label>
                <select
                  id="runs-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="field-input w-[11.5rem]"
                >
                  <option value="ALL">All statuses</option>
                  {RUN_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {RUN_STATUS_LABELS[status as RunStatus]}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => void reload()} disabled={refreshing} className="btn">
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {!loading && (
            <WorkbenchMetrics runs={runs} statusFilter={statusFilter} onFilter={setStatusFilter} />
          )}

          <div className="mb-4 flex flex-col gap-2 empty:hidden">
            {created && (
              <InlineNotice
                tone="success"
                role="status"
                title={`Created ${created.runs.length} run${created.runs.length === 1 ? "" : "s"}`}
                onDismiss={() => setCreated(null)}
              >
                <span className="block">
                  Batch <code className="hash-chip">{created.batchId}</code> — extraction
                  starts automatically.
                </span>
                <span className="mt-1 flex flex-wrap gap-x-3">
                  {created.runs.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRunId(r.id)}
                      className="link-btn"
                    >
                      {r.name}
                    </button>
                  ))}
                </span>
              </InlineNotice>
            )}
            {error && (
              <InlineNotice tone="danger" role="alert" title="Could not load runs">
                {error}{" "}
                <button type="button" onClick={() => void reload()} className="link-btn">
                  Try again
                </button>
              </InlineNotice>
            )}
          </div>

          <div className="split-grid">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Production runs</h2>
                  <p className="card-sub">
                    Agent work, review gates and rendered artifacts in one queue.
                  </p>
                </div>
                <span className="text-[9px] text-ink-mute">
                  {visible.length} of {runs.length}
                </span>
              </div>

              {loading ? (
                <div className="card-body" role="status" aria-live="polite">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="mb-1.5 h-[54px] animate-pulse rounded-[7px] border border-hair-soft bg-white/70"
                    />
                  ))}
                  <p className="mt-2 text-[10px] text-ink-mute">Loading runs…</p>
                </div>
              ) : visible.length === 0 ? (
                <div className="card-body">
                  <EmptyState
                    title={
                      runs.length === 0
                        ? statusFilter === "ALL"
                          ? "No production runs yet"
                          : `No runs with status “${RUN_STATUS_LABELS[statusFilter as RunStatus]}”`
                        : "No runs match this filter"
                    }
                  >
                    {runs.length === 0
                      ? "Create a batch from .txt or .md files to start the automated workflow."
                      : "Clear the search box or the status filter."}
                  </EmptyState>
                </div>
              ) : (
                <RunsQueue runs={visible} selectedRunId={selectedRunId} onOpen={setSelectedRunId} />
              )}
            </section>

            <div className="min-w-0">
              <RecentActivity runs={runs} onOpen={setSelectedRunId} />
            </div>
          </div>
        </div>
      )}

      <CreateBatchDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(result) => {
          setCreated(result);
          setDialogOpen(false);
          reload();
        }}
      />
    </AppShell>
  );
}
