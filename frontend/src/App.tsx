import { useEffect, useState } from "react";

import ContentToPdfPage from "./pages/ContentToPdfPage";
import RunsView from "./components/runs/RunsView";
import type { AppView } from "./components/shell/SideNav";

const REVIEWER_KEY = "contentToPdf.reviewerName";

function readStoredReviewer(): string {
  try {
    return localStorage.getItem(REVIEWER_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Two top-level views and the reviewer identity, which the rail shows in both. No
 * router and no store — nothing here needs deep linking.
 */
export default function App() {
  const [view, setView] = useState<AppView>("runs");
  const [reviewerName, setReviewerName] = useState(readStoredReviewer);

  useEffect(() => {
    try {
      localStorage.setItem(REVIEWER_KEY, reviewerName);
    } catch {
      // A blocked storage quota must not break the workspace.
    }
  }, [reviewerName]);

  return view === "create" ? (
    <ContentToPdfPage
      view={view}
      onViewChange={setView}
      reviewerName={reviewerName}
      onReviewerNameChange={setReviewerName}
    />
  ) : (
    <RunsView
      view={view}
      onViewChange={setView}
      reviewerName={reviewerName}
      onReviewerNameChange={setReviewerName}
    />
  );
}
