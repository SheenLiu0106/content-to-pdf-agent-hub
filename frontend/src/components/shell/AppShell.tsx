import type { ReactNode } from "react";

import SideNav, { type ActiveRunLink, type AppView } from "./SideNav";

interface Props {
  view: AppView;
  onViewChange: (next: AppView) => void;
  activeRun?: ActiveRunLink | null;
  onActiveRunClick?: () => void;
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
  /** Breadcrumb trail, innermost last. */
  crumbs: string[];
  /** Real search input, or nothing. Never a decorative box. */
  search?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * The floating shell: a warm-white product rail and a separate main surface on the
 * page background, each with a thin edge, a top highlight and a grounded shadow.
 */
export default function AppShell({
  view,
  onViewChange,
  activeRun,
  onActiveRunClick,
  reviewerName,
  onReviewerNameChange,
  crumbs,
  search,
  status,
  action,
  children,
}: Props) {
  return (
    <div className="app-shell">
      <SideNav
        view={view}
        onViewChange={onViewChange}
        activeRun={activeRun}
        onActiveRunClick={onActiveRunClick}
        reviewerName={reviewerName}
        onReviewerNameChange={onReviewerNameChange}
      />

      <main className="main-surface">
        <header className="topbar">
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="crumb">
              {crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={`${crumb}-${i}`} className="flex min-w-0 items-center gap-1.5">
                    {i > 0 && <span aria-hidden="true">/</span>}
                    {last ? (
                      <b aria-current="page" className="truncate">
                        {crumb}
                      </b>
                    ) : (
                      <span className="truncate">{crumb}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          {search}
          {status}
          {action}
        </header>

        <div className="h-full min-h-0 overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
