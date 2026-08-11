import { useCallback, useEffect, useRef, useState } from "react";

import * as api from "../lib/api";
import { isPollable, type RunStatus, type RunSummary } from "../lib/runTypes";

const POLL_MS = 4000;

export type StatusFilter = RunStatus | "ALL";

export interface UseRunsResult {
  runs: RunSummary[];
  /** True only for the very first load — background passes must not blank the table. */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
  statusFilter: StatusFilter;
  setStatusFilter: (next: StatusFilter) => void;
}

/**
 * The runs list, with a restrained background refresh.
 *
 * Each successful fetch schedules the next one ONLY while at least one run is
 * still expected to move server-side (see isPollable). A list of nothing but
 * gates and terminal runs settles and stops fetching entirely; an API error also
 * stops it, leaving a manual retry.
 */
export function useRuns(): UseRunsResult {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [reloadToken, setReloadToken] = useState(0);
  const loadedOnce = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function tick(background: boolean): Promise<void> {
      if (cancelled) return;
      if (background) setRefreshing(true);
      try {
        const next = await api.listRuns(
          statusFilter === "ALL" ? {} : { status: statusFilter },
          controller.signal
        );
        if (cancelled) return;
        setRuns(next);
        setError(null);
        loadedOnce.current = true;
        if (next.some((r) => isPollable(r.status, r.paused))) {
          timer = setTimeout(() => void tick(true), POLL_MS);
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setError((err as api.ApiError).message ?? "Failed to load runs.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    // A filter change or manual reload is a refresh, not an initial load.
    setLoading(!loadedOnce.current);
    void tick(loadedOnce.current);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [statusFilter, reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  return { runs, loading, refreshing, error, reload, statusFilter, setStatusFilter };
}
