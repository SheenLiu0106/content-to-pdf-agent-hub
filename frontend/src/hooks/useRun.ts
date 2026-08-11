import { useCallback, useEffect, useRef, useState } from "react";

import * as api from "../lib/api";
import { describeStaleness } from "../lib/agentUx";
import { isPollable } from "../lib/runTypes";

const POLL_MS = 4000;

export const STALE_MESSAGE =
  "This run changed since you opened it. The latest version has been loaded. Review it again before approving.";

export interface UseRunResult {
  detail: api.RunDetail | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Set when the server rejected an action with 409. Distinct from `error`. */
  stale: string | null;
  /**
   * What specifically went stale, when the 409 body's `detail` supports saying. Null
   * when it does not — a guess would be worse than the generic notice alone.
   */
  staleDetail: string | null;
  actionError: string | null;
  /** The action currently being submitted, for disabling controls. */
  inFlight: api.RunActionName | null;
  reload: () => Promise<void>;
  /** Resolves true when the server accepted the action. */
  act: (action: api.RunActionRequest) => Promise<boolean>;
  dismissStale: () => void;
  dismissActionError: () => void;
}

/**
 * One run's detail, plus the single place run actions are submitted.
 *
 * The server is authoritative: `act` never predicts the next state, it PATCHes and
 * re-reads. A 409 is handled separately from a generic failure — it sets the stale
 * banner and reloads, and it NEVER auto-retries the action.
 */
export function useRun(runId: string | null): UseRunResult {
  const [detail, setDetail] = useState<api.RunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const [staleDetail, setStaleDetail] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState<api.RunActionName | null>(null);

  // Assigned during render so a fast run switch cannot let a late response for the
  // previous run overwrite the current one.
  const activeRunId = useRef(runId);
  activeRunId.current = runId;

  // Synchronous, unlike the inFlight state, which is what actually makes a
  // double-click impossible — setState would not have landed yet.
  const submitting = useRef<api.RunActionName | null>(null);

  const load = useCallback(
    async (background: boolean): Promise<void> => {
      if (!runId) return;
      if (background) setRefreshing(true);
      else setLoading(true);
      try {
        const next = await api.getRun(runId);
        if (activeRunId.current !== runId) return;
        setDetail(next);
        setError(null);
      } catch (err) {
        if (activeRunId.current !== runId) return;
        setError((err as api.ApiError).message ?? "Failed to load this run.");
      } finally {
        if (activeRunId.current === runId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [runId]
  );

  // Selecting a different run must not show the previous run's data for a frame.
  useEffect(() => {
    setDetail(null);
    setError(null);
    setStale(null);
    setStaleDetail(null);
    setActionError(null);
    if (runId) void load(false);
  }, [runId, load]);

  // Chained poll: `load` installs a new `detail` object, so this effect re-runs and
  // schedules the following tick. It stops by itself once the status is no longer
  // pollable, and never overlaps an in-flight action.
  useEffect(() => {
    if (!detail || inFlight) return;
    if (!isPollable(detail.run.status, detail.run.paused)) return;
    const timer = setTimeout(() => void load(true), POLL_MS);
    return () => clearTimeout(timer);
  }, [detail, inFlight, load]);

  const act = useCallback(
    async (action: api.RunActionRequest): Promise<boolean> => {
      if (!runId || submitting.current) return false;
      submitting.current = action.action;
      setInFlight(action.action);
      setActionError(null);
      try {
        await api.runAction(runId, action);
        setStale(null);
        setStaleDetail(null);
        await load(true);
        return true;
      } catch (err) {
        if (api.isConflict(err)) {
          setStale(STALE_MESSAGE);
          // Named from the guard's own detail. The action itself is never repeated.
          setStaleDetail(describeStaleness(err));
          await load(true);
        } else {
          setActionError((err as api.ApiError).message ?? "The action could not be applied.");
        }
        return false;
      } finally {
        submitting.current = null;
        setInFlight(null);
      }
    },
    [runId, load]
  );

  return {
    detail,
    loading,
    refreshing,
    error,
    stale,
    staleDetail,
    actionError,
    inFlight,
    reload: useCallback(() => load(true), [load]),
    act,
    dismissStale: useCallback(() => {
      setStale(null);
      setStaleDetail(null);
    }, []),
    dismissActionError: useCallback(() => setActionError(null), []),
  };
}
