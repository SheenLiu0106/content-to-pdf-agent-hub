export type AppView = "create" | "runs";

export interface ActiveRunLink {
  id: string;
  name: string;
}

interface Props {
  view: AppView;
  onViewChange: (next: AppView) => void;
  /** The run currently open, so the rail can show it as a destination. */
  activeRun?: ActiveRunLink | null;
  onActiveRunClick?: () => void;
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
}

const QueueIcon = (
  <svg className="rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="5" rx="1.6" />
    <rect x="3" y="12" width="18" height="5" rx="1.6" />
    <path d="M7 20h10" strokeLinecap="round" />
  </svg>
);

const CreateIcon = (
  <svg className="rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M6 3h9l3 3v15H6z" strokeLinejoin="round" />
    <path d="M15 3v4h4M9 12h6M9 16h4" strokeLinecap="round" />
  </svg>
);

const RunIcon = (
  <svg className="rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v4l3 2" strokeLinecap="round" />
  </svg>
);

/**
 * The product rail. Only destinations that really exist appear — there are no
 * Brand-kit or Recipe sections, because the backend has neither.
 */
export default function SideNav({
  view,
  onViewChange,
  activeRun,
  onActiveRunClick,
  reviewerName,
  onReviewerNameChange,
}: Props) {
  return (
    <nav aria-label="Product" className="rail">
      <div className="rail-brand">
        <span className="rail-mark" aria-hidden="true">
          S
        </span>
        <span className="rail-name">
          <b>SHEEN</b>
          <small>Content to PDF</small>
        </span>
      </div>

      <p className="rail-section">Workspace</p>
      <ul className="flex flex-col gap-1">
        <li>
          <button
            type="button"
            onClick={() => onViewChange("runs")}
            aria-current={view === "runs" ? "page" : undefined}
            className={`rail-btn ${view === "runs" ? "is-active" : ""}`}
            aria-label="Runs"
          >
            {QueueIcon}
            <span>Runs</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => onViewChange("create")}
            aria-current={view === "create" ? "page" : undefined}
            className={`rail-btn ${view === "create" ? "is-active" : ""}`}
            aria-label="Create"
          >
            {CreateIcon}
            <span>Create</span>
          </button>
        </li>
      </ul>

      {activeRun && (
        <>
          <p className="rail-section">Active run</p>
          <ul className="flex flex-col gap-1">
            <li>
              <button
                type="button"
                onClick={onActiveRunClick}
                className="rail-btn is-active"
                title={activeRun.name}
              >
                {RunIcon}
                <span className="min-w-0 truncate">{activeRun.name}</span>
              </button>
            </li>
          </ul>
        </>
      )}

      {/* Reviewer identity — the name every decision is recorded against. */}
      <div className="rail-foot">
        <label className="field-label" htmlFor="rail-reviewer">
          Reviewer
        </label>
        <input
          id="rail-reviewer"
          type="text"
          className="field-input"
          value={reviewerName}
          placeholder="Your name"
          autoComplete="name"
          onChange={(e) => onReviewerNameChange(e.target.value)}
        />
        <p className="mt-1.5 text-[8px] leading-relaxed text-ink-mute">
          Recorded on every waiver and gate decision.
        </p>
      </div>
    </nav>
  );
}
