import type { CSSProperties, ReactNode } from "react";

/**
 * The production workspace: a fixed-height head row over panes that scroll
 * independently, so the document canvas stays the visual centre instead of the page
 * growing into one long scroll.
 */
export function Workspace({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="workspace">
      {head}
      <div className="workspace-shell-body">{children}</div>
    </div>
  );
}

export function WorkspaceHead({
  title,
  subtitle,
  center,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-head">
      <div className="ws-title">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {center}
      {actions && <div className="ws-actions">{actions}</div>}
    </header>
  );
}

export function WorkspaceBody({
  variant = "three",
  children,
}: {
  variant?: "three" | "inspect" | "two";
  children: ReactNode;
}) {
  const mod = variant === "inspect" ? "is-inspect" : variant === "two" ? "is-two" : "";
  return <div className={`workspace-body ${mod}`}>{children}</div>;
}

export function Pane({
  edge,
  children,
}: {
  edge?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <aside className={`pane ${edge === "left" ? "edge-l" : edge === "right" ? "edge-r" : ""}`}>
      {children}
    </aside>
  );
}

export function PaneTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="pane-title">
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

export function PaneBody({ children }: { children: ReactNode }) {
  return <div className="pane-body">{children}</div>;
}

/** The recessed centre surface, with an optional toolbar row above the sheet. */
export function CanvasPane({ tools, children }: { tools?: ReactNode; children: ReactNode }) {
  return (
    <section className={`canvas ${tools ? "" : "no-tools"}`}>
      {tools && <div className="canvas-tools">{tools}</div>}
      <div className="canvas-scroll">{children}</div>
    </section>
  );
}

/** A printed sheet: warm stock, faint rule texture, layered bottom edge. */
export function PaperSheet({
  pad = false,
  editorial = false,
  className = "",
  style,
  children,
}: {
  pad?: boolean;
  /** Applies the publication serif hierarchy inside the sheet. */
  editorial?: boolean;
  className?: string;
  /** Used to carry the run's --doc-* brand accents onto the sheet. */
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <article
      style={style}
      className={`paper ${pad ? "paper-pad" : ""} ${editorial ? "paper-doc" : ""} ${className}`}
    >
      {children}
    </article>
  );
}
