import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import * as api from "../../lib/api";
import { CanvasPane, Pane, PaneBody, PaneTitle } from "../shell/Workspace";
import { formatTime } from "../../lib/runTypes";
import { agentPhase, CONSEQUENCES, documentOrigin, runStages } from "../../lib/agentUx";
import AgentProgress from "../agent/AgentProgress";
import AgentScope from "../agent/AgentScope";
import ContentOriginBadge from "../agent/ContentOriginBadge";
import RecoveryNotice from "../agent/RecoveryNotice";
import ApprovalHistory from "./ApprovalHistory";
import DecisionForm, { ReviewerNameField } from "./DecisionForm";
import DocumentChecks from "./DocumentChecks";
import IssuesPanel from "./IssuesPanel";
import QaSummary from "./QaSummary";
import RunTimeline from "./RunTimeline";
import { Hash, InlineNotice, MetaField, MetaGrid, Section } from "./ui";

interface Props {
  detail: api.RunDetail;
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
  act: (action: api.RunActionRequest) => Promise<boolean>;
  inFlight: api.RunActionName | null;
  banners: ReactNode;
}

/**
 * The artifact bytes as a blob URL.
 *
 * The route sends `Content-Disposition: attachment`, so an iframe pointed straight at
 * it downloads the file instead of previewing it. Every URL created here is revoked
 * when the run changes, when a new artifact replaces it (the effect is keyed on the
 * digest), when the component unmounts, and explicitly via `revoke` once
 * request_changes invalidates the artifact.
 */
function usePdfPreview(runId: string, artifactSha256: string | null, hasArtifact: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const held = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (held.current) {
      URL.revokeObjectURL(held.current);
      held.current = null;
    }
    setUrl(null);
  }, []);

  useEffect(() => {
    if (!hasArtifact) {
      setError(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .fetchRunPdf(runId, controller.signal)
      .then((blob) => {
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        held.current = next;
        setUrl(next);
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        const e = err as api.ApiError;
        setError(
          e.status === 404
            ? "This run has no active rendered PDF."
            : (e.message ?? "The rendered PDF could not be loaded.")
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      revoke();
    };
  }, [runId, artifactSha256, hasArtifact, revoke]);

  return { url, loading, error, revoke };
}

/**
 * The APPROVAL gate as a PDF inspection workspace: a narrow artifact rail, the
 * rendered PDF as the central object, and QA plus the final decision on the right.
 * Content and configuration are deliberately not editable — the server only permits
 * update_content/update_config in REVIEW, so an edit requires request_changes first.
 */
export default function ApprovalWorkspace({
  detail,
  reviewerName,
  onReviewerNameChange,
  act,
  inFlight,
  banners,
}: Props) {
  const { run } = detail;
  const preview = usePdfPreview(run.id, detail.artifactSha256, detail.hasArtifact);

  // A mismatch means the stored content moved after the render, so the artifact no
  // longer represents it. The server would answer with artifact_fingerprint_stale.
  const artifactStale =
    detail.renderedFingerprint !== null &&
    detail.renderedFingerprint !== detail.currentFingerprint;

  const qaFailed = run.qa?.verdict === "fail";
  const blocked = detail.openBlockingCount > 0;
  const cannotApprove = !detail.hasArtifact || artifactStale || qaFailed || blocked;

  const approveDisabledReason = !detail.hasArtifact
    ? "There is no active rendered PDF to approve."
    : artifactStale
      ? "The stored content changed after this PDF was rendered. Request changes so it can be re-rendered."
      : qaFailed
        ? "Output QA failed for this artifact, so it cannot be approved."
        : blocked
          ? `${detail.openBlockingCount} blocking issue${detail.openBlockingCount === 1 ? "" : "s"} must be resolved or waived first.`
          : undefined;

  return (
    <>
      {/* --------------------------- artifact rail --------------------------- */}
      <Pane edge="right">
        <PaneTitle title="Artifact" subtitle="Immutable output of the render stage." />
        <PaneBody>
          <Section title="What you are signing">
            {/* Badges sit in the body: two nowrap pills in the head would squeeze the title. */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <ContentOriginBadge kind="restructured" />
              {documentOrigin(detail).humanApproved && (
                <ContentOriginBadge kind="human_approved" />
              )}
            </div>
            <p className="text-[9px] leading-relaxed text-ink-mute">
              An agent-produced document, rendered from content a human reviewed and
              approved at the review gate. Your signature covers this exact file and the
              content behind it.
            </p>
            <div className="mt-2.5">
              {artifactStale ? (
                <RecoveryNotice
                  role="status"
                  title="This PDF is out of date"
                  what="The stored content changed after this PDF was rendered, so the artifact no longer represents what is stored."
                  next="Request changes to send the run back to review; a new render then produces the artifact you can sign."
                />
              ) : (
                <p className="text-[8.5px] leading-relaxed text-ink-mute">
                  The rendered fingerprint matches the current content, so this PDF
                  represents exactly what is stored.
                </p>
              )}
            </div>
          </Section>

          {detail.hasArtifact && (
            <a href={api.runPdfUrl(run.id)} download={`${run.name}.pdf`} className="btn full">
              Download PDF
            </a>
          )}

          <AgentScope
            reviewPolicy={run.reviewPolicy}
            approvalMode={run.approvalMode}
            variant="compact"
          />

          <Section title="Identity" subtitle="Technical detail, kept out of the way.">
            <MetaGrid columns={1}>
              <MetaField label="Render attempts" value={run.renderAttempts} />
              <MetaField label="Rendered" value={formatTime(run.updatedAt)} />
              <Hash value={detail.artifactSha256} label="Artifact SHA-256" />
              <Hash value={detail.renderedFingerprint} label="Rendered fingerprint" />
              <Hash value={detail.currentFingerprint} label="Current fingerprint" />
            </MetaGrid>
          </Section>
        </PaneBody>
      </Pane>

      {/* ------------------------- the artifact itself ------------------------ */}
      <CanvasPane
        tools={
          <>
            <span className="tool-btn is-active">Rendered output</span>
            <span className="text-[8px] uppercase tracking-[0.08em] text-ink-mute">
              The exact artifact your approval signs
            </span>
          </>
        }
      >
        {banners && (
          <div className="mx-auto mb-4 flex w-[min(720px,100%)] flex-col gap-2">{banners}</div>
        )}

        {preview.loading && (
          <div
            role="status"
            className="paper grid min-h-[32rem] place-items-center text-[10px] text-ink-mute"
          >
            Loading the rendered PDF…
          </div>
        )}

        {!preview.loading && preview.error && (
          <div className="mx-auto w-[min(720px,100%)]">
            <InlineNotice tone="warning" role="alert" title="No preview available">
              {preview.error}
            </InlineNotice>
          </div>
        )}

        {!preview.loading && !preview.error && preview.url && (
          <iframe
            src={preview.url}
            title={`Rendered PDF preview for ${run.name}`}
            className="paper block h-[min(78vh,52rem)] min-h-[32rem] w-[min(720px,100%)]"
          />
        )}

        {!preview.loading && !preview.error && !preview.url && !detail.hasArtifact && (
          <div className="mx-auto w-[min(720px,100%)]">
            <InlineNotice tone="warning" title="No active artifact">
              This run does not currently have a rendered PDF.
            </InlineNotice>
          </div>
        )}
      </CanvasPane>

      {/* ------------------------- QA and final gate ------------------------- */}
      <Pane edge="left">
        <div className="px-3.5 pb-1 pt-3.5">
          <AgentProgress
            phase={agentPhase(run.status, run.paused)}
            stages={runStages(detail)}
            paused={run.paused}
            headline="Artifact ready for sign-off"
            body="The agent has done everything it is allowed to do. Approval signs this exact artifact and its content fingerprint; automatic approval stays disabled until rendered-output QA ships, so this decision is always a human's."
          />
        </div>
        <PaneTitle title="Quality and decision" subtitle="Human decision required." />
        <PaneBody>
          <QaSummary qa={run.qa} />
          <DocumentChecks detail={detail} />

          {detail.issues.length > 0 && (
            <IssuesPanel
              issues={detail.issues}
              openBlockingCount={detail.openBlockingCount}
              canWaive={false}
              reviewerName={reviewerName}
              onReviewerNameChange={onReviewerNameChange}
              onWaive={async () => false}
              busy={inFlight !== null}
            />
          )}

          <Section title="Final gate">
            <div className="flex flex-col gap-3.5">
              <ReviewerNameField value={reviewerName} onChange={onReviewerNameChange} />

              <DecisionForm
                hideReviewerField
                submitLabel="Approve final PDF"
                confirmLabel="Confirm final approval"
                confirmPrompt="This signs this exact PDF and its content fingerprint. The run becomes approved and cannot be edited afterwards."
                consequences={CONSEQUENCES.approve_final}
                tone="accent"
                noteRequired={false}
                noteLabel="Approval note"
                reviewerName={reviewerName}
                onReviewerNameChange={onReviewerNameChange}
                disabled={cannotApprove}
                disabledReason={approveDisabledReason}
                busy={inFlight === "approve_gate"}
                onSubmit={(note) =>
                  act({
                    action: "approve_gate",
                    gate: "approval",
                    reviewerName: reviewerName.trim(),
                    ...(note ? { note } : {}),
                    // Both values exactly as returned by the most recent
                    // GET /api/runs/:id — never recomputed on the client.
                    expectedFingerprint: detail.currentFingerprint,
                    expectedArtifactSha256: detail.artifactSha256 ?? "",
                  })
                }
              />

              <div className="border-t border-hair-soft pt-3.5">
                <DecisionForm
                  hideReviewerField
                  submitLabel="Request changes"
                  confirmLabel="Confirm request changes"
                  confirmPrompt="This sends the run back to review and invalidates the current PDF."
                  consequences={CONSEQUENCES.request_changes}
                  tone="primary"
                  noteRequired
                  noteLabel="What needs to change"
                  notePlaceholder="Describe the change required before re-rendering."
                  reviewerName={reviewerName}
                  onReviewerNameChange={onReviewerNameChange}
                  busy={inFlight === "request_changes"}
                  onSubmit={async (note) => {
                    const ok = await act({
                      action: "request_changes",
                      reviewerName: reviewerName.trim(),
                      note,
                    });
                    // Drop the invalidated artifact immediately — it must never keep
                    // showing as the active PDF.
                    if (ok) preview.revoke();
                    return ok;
                  }}
                />
              </div>

              <div className="border-t border-hair-soft pt-3.5">
                <DecisionForm
                  hideReviewerField
                  submitLabel="Reject run"
                  confirmLabel="Confirm reject"
                  confirmPrompt="Rejecting is final — this run cannot be resumed afterwards."
                  consequences={CONSEQUENCES.reject}
                  tone="danger"
                  noteRequired
                  noteLabel="Reason for rejection"
                  notePlaceholder="Why is this run being rejected?"
                  reviewerName={reviewerName}
                  onReviewerNameChange={onReviewerNameChange}
                  busy={inFlight === "reject"}
                  onSubmit={(note) =>
                    act({ action: "reject", reviewerName: reviewerName.trim(), note })
                  }
                />
              </div>
            </div>
          </Section>

          <ApprovalHistory approvals={detail.approvals} />
          <RunTimeline events={detail.events} />
        </PaneBody>
      </Pane>
    </>
  );
}
