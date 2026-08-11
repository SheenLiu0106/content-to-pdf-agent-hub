import type { ReactNode } from "react";

import ConsequencePreview from "./ConsequencePreview";

interface Props {
  tone?: "info" | "warning" | "danger";
  title: string;
  /** What happened, in the user's terms. */
  what: ReactNode;
  /** What specifically went stale, when the server's detail supports saying. */
  detail?: string | null;
  /** What to do about it. */
  next?: ReactNode;
  consequences?: readonly string[];
  /** Recovery controls — reload, retry, request changes. */
  actions?: ReactNode;
  onDismiss?: () => void;
  role?: "alert" | "status";
}

/**
 * A recoverable interruption: a stale view, a conflict, a failed stage.
 *
 * Always says what happened, adds the specific staleness when the 409 body supports it,
 * and offers the way out. It never repeats the action that failed on the user's behalf.
 */
export default function RecoveryNotice({
  tone = "warning",
  title,
  what,
  detail,
  next,
  consequences,
  actions,
  onDismiss,
  role = "alert",
}: Props) {
  const cls = tone === "danger" ? "t-danger" : tone === "info" ? "" : "t-warn";
  return (
    <div role={role} className={`notice ${cls}`}>
      <div className="min-w-0">
        <strong className="block">{title}</strong>
        <span className="block">{what}</span>
        {detail && (
          <span className="mt-1 block font-medium text-ink-soft">{detail}</span>
        )}
        {next && <span className="mt-1 block">{next}</span>}
        {consequences && consequences.length > 0 && (
          <div className="mt-2">
            <ConsequencePreview items={consequences} title="If you continue" />
          </div>
        )}
        {actions && <span className="mt-2 flex flex-wrap items-center gap-2">{actions}</span>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="link-btn shrink-0">
          ✕
        </button>
      )}
    </div>
  );
}
