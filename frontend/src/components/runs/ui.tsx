import type { ReactNode } from "react";

// Thin React wrappers over the design system in styles/workspace.css. Components
// carry semantic class names rather than long inline utility strings.

export function Section({
  title,
  subtitle,
  action,
  children,
  tone,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  /** 'decision' renders the prominent amber decision-card treatment. */
  tone?: "decision";
}) {
  return (
    <section className={tone === "decision" ? "decision-card" : "panel-card"}>
      {(title || action) && (
        <div className="panel-head">
          <div className="min-w-0">
            {title && <h4>{title}</h4>}
            {subtitle && <span className="mt-1 block leading-relaxed">{subtitle}</span>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function MetaGrid({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return <dl className={`meta-grid ${columns === 1 ? "one-col" : ""}`}>{children}</dl>;
}

export function MetaField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="meta-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** A fingerprint or artifact digest: short, full value in `title`, copyable. */
export function Hash({ value, label }: { value: string | null; label: string }) {
  if (!value) {
    return <MetaField label={label} value={<span className="text-ink-faint">None</span>} />;
  }
  return (
    <div className="meta-field">
      <dt>{label}</dt>
      <dd className="flex items-center gap-1.5">
        <code className="hash-chip" title={value}>
          {value.slice(0, 12)}…
        </code>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(value)}
          aria-label={`Copy full ${label}`}
          className="link-btn"
        >
          Copy
        </button>
      </dd>
    </div>
  );
}

/** Native <details> — keyboard accessible for free, no state to manage. */
export function Collapsible({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group mt-1.5">
      <summary className="cursor-pointer list-none text-[8.5px] font-bold uppercase tracking-[0.08em] text-ink-faint hover:text-ink-soft">
        <span aria-hidden="true" className="inline-block w-3 transition-transform group-open:rotate-90">
          ›
        </span>
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export function RawDetail({ detail }: { detail: unknown }) {
  if (detail === null || detail === undefined) return null;
  return (
    <Collapsible summary="Technical detail">
      <pre className="overflow-x-auto rounded-[5px] border border-hair-soft bg-[#f4f4f1] p-2 font-mono text-[8.5px] leading-relaxed text-ink-soft">
        {JSON.stringify(detail, null, 2)}
      </pre>
    </Collapsible>
  );
}

export function InlineNotice({
  tone = "info",
  title,
  children,
  onDismiss,
  role,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  role?: "alert" | "status";
}) {
  const cls =
    tone === "warning" ? "t-warn" : tone === "danger" ? "t-danger" : tone === "success" ? "t-ok" : "";
  return (
    <div role={role} className={`notice ${cls}`}>
      <div className="min-w-0">
        {title && <strong className="block">{title}</strong>}
        {children}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="link-btn shrink-0">
          ✕
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Button variants from the design system. */
export const BTN = {
  primary: "btn dark",
  accent: "btn accent",
  secondary: "btn",
  danger: "btn danger",
  quiet: "btn quiet",
} as const;

export const INPUT = "field-input";
export const LABEL = "field-label";
