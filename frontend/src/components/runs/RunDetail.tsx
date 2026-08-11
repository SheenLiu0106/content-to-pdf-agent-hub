import * as api from "../../lib/api";
import {
  agentPhase,
  documentOrigin,
  PHASE_KIND_LABELS,
  retryConsequences,
  runStages,
} from "../../lib/agentUx";
import {
  formatTime,
  RUN_STATUS_DESCRIPTIONS,
} from "../../lib/runTypes";
import { useRun } from "../../hooks/useRun";
import AgentProgress from "../agent/AgentProgress";
import AgentScope from "../agent/AgentScope";
import ContentOriginBadge from "../agent/ContentOriginBadge";
import RecoveryNotice from "../agent/RecoveryNotice";
import {
  CanvasPane,
  Pane,
  PaneBody,
  PaneTitle,
  PaperSheet,
  Workspace,
  WorkspaceBody,
  WorkspaceHead,
} from "../shell/Workspace";
import ApprovalHistory from "./ApprovalHistory";
import ApprovalWorkspace from "./ApprovalWorkspace";
import DocumentChecks from "./DocumentChecks";
import IssuesPanel from "./IssuesPanel";
import QaSummary from "./QaSummary";
import ReviewWorkspace from "./ReviewWorkspace";
import RunActions, { PauseNote } from "./RunActions";
import RunStatusBadge, { PausedBadge } from "./RunStatusBadge";
import RunTimeline from "./RunTimeline";
import StageTrack from "./StageTrack";
import { Hash, InlineNotice, MetaField, MetaGrid, Section } from "./ui";

interface Props {
  runId: string;
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
  onBack: () => void;
  /** Lets the queue pick up a status change caused by a decision here. */
  onRunChanged: () => void;
}

export default function RunDetail({
  runId,
  reviewerName,
  onReviewerNameChange,
  onBack,
  onRunChanged,
}: Props) {
  const {
    detail,
    loading,
    refreshing,
    error,
    stale,
    staleDetail,
    actionError,
    inFlight,
    reload,
    act,
    dismissStale,
    dismissActionError,
  } = useRun(runId);

  async function runAction(action: api.RunActionRequest): Promise<boolean> {
    const ok = await act(action);
    onRunChanged();
    return ok;
  }

  if (loading && !detail) {
    return (
      <div className="content-scroll" role="status" aria-live="polite">
        <div className="h-6 w-56 animate-pulse rounded-[6px] bg-shell-canvas" />
        <div className="mt-4 h-40 animate-pulse rounded-[9px] border border-hair-soft bg-white/60" />
        <p className="mt-3 text-[10px] text-ink-mute">Loading run…</p>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="content-scroll">
        <button type="button" onClick={onBack} className="btn quiet mb-3">
          ← All runs
        </button>
        <InlineNotice tone="danger" role="alert" title="Could not load this run">
          {error}{" "}
          <button type="button" onClick={() => void reload()} className="link-btn">
            Try again
          </button>
        </InlineNotice>
      </div>
    );
  }

  if (!detail) return null;

  const { run } = detail;
  const isReview = run.status === "REVIEW";
  const isApproval = run.status === "APPROVAL";
  const phase = agentPhase(run.status, run.paused);
  const live = run.status === "EXTRACTING" || run.status === "RENDERING";
  const origin = documentOrigin(detail);

  const refreshButton = (
    <button
      type="button"
      onClick={() => void reload()}
      disabled={inFlight !== null}
      className="btn"
    >
      Refresh latest version
    </button>
  );

  // Banners sit inside the canvas so a 409 or failure is never scrolled out of a side
  // pane and missed. Each one says what happened and how to recover; none of them
  // re-submits the action that failed.
  const banners = (
    <>
      {stale && (
        <RecoveryNotice
          title="This run changed"
          what={stale}
          detail={staleDetail}
          next="Nothing was submitted twice — the decision was rejected once and the latest version is now on screen."
          actions={refreshButton}
          onDismiss={dismissStale}
        />
      )}
      {actionError && (
        <RecoveryNotice
          tone="danger"
          title="The action failed"
          what={actionError}
          next="The run is unchanged. You can try the same decision again once the cause is cleared."
          actions={refreshButton}
          onDismiss={dismissActionError}
        />
      )}
      {error && (
        <RecoveryNotice
          tone="danger"
          title="Refresh failed"
          what={error}
          next="You may be looking at an older version of this run."
          actions={refreshButton}
        />
      )}
      {run.lastError && (
        <RecoveryNotice
          tone={run.status === "FAILED" ? "danger" : "warning"}
          title={
            run.status === "FAILED"
              ? `Stopped during ${run.lastErrorStage ?? "the last stage"}`
              : `Recovered from an error during ${run.lastErrorStage ?? "an earlier stage"}`
          }
          what={run.lastError}
          next={
            run.nextAttemptAt
              ? `A retry is already scheduled for ${formatTime(run.nextAttemptAt)}.`
              : run.status === "FAILED"
                ? "Retry from the run header when you are ready."
                : undefined
          }
          consequences={run.status === "FAILED" ? retryConsequences(run.lastErrorStage) : undefined}
        />
      )}
    </>
  );

  const hasBanner = Boolean(stale || actionError || error || run.lastError);

  const head = (
    <WorkspaceHead
      title={run.name}
      subtitle={
        <>
          Run {run.id.slice(0, 8)} · {RUN_STATUS_DESCRIPTIONS[run.status]}
        </>
      }
      center={<StageTrack status={run.status} />}
      actions={
        <>
          <RunStatusBadge status={run.status} />
          {run.paused && <PausedBadge />}
          {refreshing && (
            <span role="status" className="text-[9px] text-ink-faint">
              Refreshing…
            </span>
          )}
          <RunActions
            status={run.status}
            paused={run.paused}
            lastErrorStage={run.lastErrorStage}
            inFlight={inFlight}
            onAction={(action) => void runAction(action)}
          />
          {refreshButton}
        </>
      }
    />
  );

  if (isReview) {
    return (
      <Workspace head={head}>
        <WorkspaceBody>
          <ReviewWorkspace
            detail={detail}
            reviewerName={reviewerName}
            onReviewerNameChange={onReviewerNameChange}
            act={runAction}
            inFlight={inFlight}
            banners={hasBanner ? banners : null}
          />
        </WorkspaceBody>
      </Workspace>
    );
  }

  if (isApproval) {
    return (
      <Workspace head={head}>
        <WorkspaceBody variant="inspect">
          <ApprovalWorkspace
            detail={detail}
            reviewerName={reviewerName}
            onReviewerNameChange={onReviewerNameChange}
            act={runAction}
            inFlight={inFlight}
            banners={hasBanner ? banners : null}
          />
        </WorkspaceBody>
      </Workspace>
    );
  }

  // Non-gate statuses: nothing is editable and there is no decision to take, so the
  // source sits on paper in the centre with the agent's real progress on the right.
  return (
    <Workspace head={head}>
      <WorkspaceBody variant="two">
        <CanvasPane
          tools={
            <>
              <span className="tool-btn is-active">Source</span>
              <span className="text-[8px] uppercase tracking-[0.08em] text-ink-mute">
                Immutable — extraction always replays from this
              </span>
            </>
          }
        >
          {hasBanner && (
            <div className="mx-auto mb-4 flex w-[min(720px,100%)] flex-col gap-2">{banners}</div>
          )}
          <div className="origin-strip">
            <ContentOriginBadge kind="source" />
            <span className="origin-note">
              The stored source, exactly as submitted. Nothing on this screen has been
              rewritten.
            </span>
          </div>
          <PaperSheet pad editorial>
            <p className="doc-eyebrow">
              <span>{run.name}</span>
              <span>{run.config.documentLabel}</span>
            </p>
            <pre className="mt-6 whitespace-pre-wrap break-words font-sans text-[11px] leading-[1.72] text-[var(--doc-ink)]">
              {run.rawContent}
            </pre>
          </PaperSheet>
          {run.content === null && (
            <div className="mx-auto mt-4 w-[min(720px,100%)]">
              <InlineNotice tone="info">
                Structured content appears once extraction finishes. It becomes editable at
                the review gate.
              </InlineNotice>
            </div>
          )}
        </CanvasPane>

        <Pane edge="left">
          <div className="px-3.5 pb-1 pt-3.5">
            <AgentProgress
              phase={phase}
              stages={runStages(detail)}
              live={live}
              paused={run.paused}
              headline={
                run.status === "FAILED"
                  ? "Stopped after a failure"
                  : run.paused
                    ? "Paused between stages"
                    : phase.label
              }
              body={RUN_STATUS_DESCRIPTIONS[run.status]}
              pauseNote={
                run.paused
                  ? "Paused: the next stage will not start. A stage already running still finishes and is saved."
                  : undefined
              }
            />
          </div>
          <PaneTitle title="Run state" subtitle={PHASE_KIND_LABELS[phase.kind]} />
          <PaneBody>
            <AgentScope
              reviewPolicy={run.reviewPolicy}
              approvalMode={run.approvalMode}
              variant="compact"
            />

            <Section title="State">
              <MetaGrid>
                <MetaField label="Extract attempts" value={run.extractAttempts} />
                <MetaField label="Render attempts" value={run.renderAttempts} />
                <MetaField label="Active artifact" value={detail.hasArtifact ? "Yes" : "No"} />
                <MetaField label="Updated" value={formatTime(run.updatedAt)} />
                <MetaField
                  label="Content origin"
                  value={
                    origin.restructured ? (
                      <ContentOriginBadge kind="restructured" />
                    ) : (
                      <span className="text-ink-faint">Not extracted yet</span>
                    )
                  }
                />
                <MetaField
                  label="Batch"
                  value={<span className="font-mono text-[9px]">{run.batchId}</span>}
                />
              </MetaGrid>
              <div className="mt-2.5">
                <PauseNote />
              </div>
            </Section>

            {run.status === "APPROVED" && (
              <div className="scope-box">
                <strong>
                  Human approved <ContentOriginBadge kind="human_approved" />
                </strong>
                <p>
                  A reviewer signed this artifact and its content fingerprint. The run is
                  closed: it cannot be edited, re-rendered or re-decided.
                </p>
              </div>
            )}

            {detail.hasArtifact && (
              <a href={api.runPdfUrl(run.id)} download={`${run.name}.pdf`} className="btn full">
                Download PDF
              </a>
            )}

            <QaSummary qa={run.qa} />
            <DocumentChecks detail={detail} />

            <IssuesPanel
              issues={detail.issues}
              openBlockingCount={detail.openBlockingCount}
              canWaive={false}
              reviewerName={reviewerName}
              onReviewerNameChange={onReviewerNameChange}
              onWaive={async () => false}
              busy={inFlight !== null}
            />

            <ApprovalHistory approvals={detail.approvals} />
            <RunTimeline events={detail.events} />

            <Section title="Identity" subtitle="Technical detail, kept out of the way.">
              <MetaGrid columns={1}>
                <Hash value={detail.currentFingerprint} label="Current fingerprint" />
                <Hash value={detail.renderedFingerprint} label="Rendered fingerprint" />
                <Hash value={detail.artifactSha256} label="Artifact SHA-256" />
              </MetaGrid>
            </Section>
          </PaneBody>
        </Pane>
      </WorkspaceBody>
    </Workspace>
  );
}
