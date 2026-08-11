import { useState } from "react";

import HumanDecisionCard, {
  type DecisionOption,
} from "../agent/HumanDecisionCard";
import { CONSEQUENCES, explainIssue } from "../../lib/agentUx";
import {
  formatTime,
  humanizeLocator,
  ISSUE_SEVERITY_LABELS,
  ISSUE_SOURCE_LABELS,
  ISSUE_STATUS_LABELS,
  type RunIssue,
} from "../../lib/runTypes";
import DecisionForm from "./DecisionForm";
import { Collapsible, Hash, MetaGrid } from "./ui";

interface Props {
  issues: RunIssue[];
  openBlockingCount: number;
  /** Waiving is only legal in REVIEW (ACTION_ALLOWED_IN in machine.ts). */
  canWaive: boolean;
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
  onWaive: (issue: RunIssue, note: string) => Promise<boolean>;
  busy: boolean;
}

/** What this finding leaves the reviewer to decide, and where each choice leads. */
function optionsFor(issue: RunIssue, canWaive: boolean): DecisionOption[] {
  if (issue.status !== "open") {
    return [
      {
        label: "Already decided",
        outcome:
          issue.resolutionAction === "waived"
            ? "A reviewer waived this finding. It stays on the record and does not block the gate."
            : "The detector stopped reporting this finding, so it was cleared automatically. Nobody had to waive it.",
      },
    ];
  }

  const editOutcome =
    issue.severity === "blocking"
      ? "Editing the draft re-runs the detectors on save. If the finding is gone it clears itself — a human cannot mark a still-detected finding as fixed."
      : "Editing the draft re-runs the detectors on save. This finding does not block the gate either way.";

  const options: DecisionOption[] = [
    { label: "Change the content", outcome: editOutcome },
  ];

  if (issue.severity === "blocking") {
    options.push({
      label: "Waive it",
      outcome:
        "Records your name and reason against this exact finding, and unblocks the gate. The content is not changed and the finding stays visible as waived.",
      available: canWaive,
      unavailableReason: canWaive
        ? undefined
        : "Waiving is only possible at the review gate. Use “Request changes” to send this run back there.",
    });
    options.push({
      label: "Reject the run",
      outcome: "Ends the run permanently. It cannot be resumed, retried or re-rendered.",
    });
  } else {
    options.push({
      label: "Leave it",
      outcome: "Warnings are recorded for the audit trail and never block a gate.",
    });
    // The server permits waiving any open finding, not only blocking ones, so the
    // option is listed wherever the control is offered.
    options.push({
      label: "Waive it",
      outcome:
        "Records your name and reason against this finding. Nothing was blocking, so nothing is unblocked — it becomes a documented decision instead of an open note.",
      available: canWaive,
      unavailableReason: canWaive ? undefined : "Only possible at the review gate.",
    });
  }

  return options;
}

/**
 * One finding, presented as the decision it is: why the agent stopped, what content it
 * concerns, the evidence recorded for it, and where each available choice leads.
 *
 * Open blocking findings get the prominent decision-card treatment; warnings and
 * already-decided findings use the quiet one.
 */
function IssueCard({
  issue,
  canWaive,
  reviewerName,
  onReviewerNameChange,
  onWaive,
  busy,
  prominent,
}: {
  issue: RunIssue;
  canWaive: boolean;
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
  onWaive: (issue: RunIssue, note: string) => Promise<boolean>;
  busy: boolean;
  prominent: boolean;
}) {
  const [waiving, setWaiving] = useState(false);
  const waivable = canWaive && issue.status === "open";
  const explanation = explainIssue(issue);

  return (
    <HumanDecisionCard
      prominent={prominent}
      severityLabel={ISSUE_SEVERITY_LABELS[issue.severity]}
      statusLabel={ISSUE_STATUS_LABELS[issue.status]}
      sourceLabel={ISSUE_SOURCE_LABELS[issue.source]}
      headline={issue.message}
      why={explanation.why}
      locatorLabel={humanizeLocator(issue.locator)}
      locator={issue.locator}
      code={issue.code}
      origin={explanation.origin}
      evidence={
        <p>
          <strong className="font-semibold text-ink-soft">Evidence:</strong> Detected by the{" "}
          {ISSUE_SOURCE_LABELS[issue.source].toLowerCase()} stage on{" "}
          {formatTime(issue.detectedAt)}, last confirmed {formatTime(issue.lastSeenAt)}.{" "}
          {explanation.decide}
        </p>
      }
      options={optionsFor(issue, canWaive)}
      resolution={
        issue.status !== "open" ? (
          <p>
            {issue.resolutionAction === "waived" ? "Waived" : "Cleared automatically"}
            {issue.resolutionReviewerName ? ` by ${issue.resolutionReviewerName}` : ""}
            {issue.resolvedAt ? ` · ${formatTime(issue.resolvedAt)}` : ""}
            {issue.resolutionNote ? ` — “${issue.resolutionNote}”` : ""}
          </p>
        ) : null
      }
      technical={
        <Collapsible summary="Technical detail">
          <MetaGrid>
            <Hash value={issue.findingFingerprint} label="Finding fingerprint" />
          </MetaGrid>
        </Collapsible>
      }
    >
      {waivable && !waiving && (
        <button
          type="button"
          onClick={() => setWaiving(true)}
          aria-label={`Waive issue: ${issue.message}`}
          className="btn accent full mt-2"
        >
          Waive this issue
        </button>
      )}

      {waivable && waiving && (
        <div className="mt-2 border-t border-[rgba(242,107,58,0.16)] pt-2.5">
          <DecisionForm
            hideReviewerField
            submitLabel="Waive this issue"
            confirmLabel="Confirm waive"
            confirmPrompt="This waiver is recorded permanently against this finding. Waive it?"
            consequences={CONSEQUENCES.waive_issue}
            tone="accent"
            noteRequired
            noteLabel="Reason for waiving"
            notePlaceholder="Why is this finding acceptable?"
            reviewerName={reviewerName}
            onReviewerNameChange={onReviewerNameChange}
            busy={busy}
            onSubmit={async (note) => {
              const ok = await onWaive(issue, note);
              if (ok) setWaiving(false);
              return ok;
            }}
          />
          <button type="button" onClick={() => setWaiving(false)} className="btn quiet mt-1.5">
            Cancel waiver
          </button>
        </div>
      )}
    </HumanDecisionCard>
  );
}

export default function IssuesPanel({
  issues,
  openBlockingCount,
  canWaive,
  reviewerName,
  onReviewerNameChange,
  onWaive,
  busy,
}: Props) {
  const open = issues.filter((i) => i.status === "open");
  const closed = issues.filter((i) => i.status !== "open");
  const blocking = open.filter((i) => i.severity === "blocking");
  const other = open.filter((i) => i.severity !== "blocking");

  if (issues.length === 0) {
    return (
      <section className="panel-card">
        <div className="panel-head">
          <h4>Issues</h4>
          <span>None</span>
        </div>
        <div className="panel-body">
          <p className="text-[9px] text-ink-mute">
            The agent did not record any issues for this run.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {openBlockingCount > 0 && (
        <p className="text-[9px] font-semibold leading-relaxed text-ember-ink">
          {openBlockingCount} blocking issue{openBlockingCount === 1 ? "" : "s"} must be
          resolved or waived before this run can proceed.
        </p>
      )}

      {blocking.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          prominent
          canWaive={canWaive}
          reviewerName={reviewerName}
          onReviewerNameChange={onReviewerNameChange}
          onWaive={onWaive}
          busy={busy}
        />
      ))}

      {other.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          prominent={false}
          canWaive={canWaive}
          reviewerName={reviewerName}
          onReviewerNameChange={onReviewerNameChange}
          onWaive={onWaive}
          busy={busy}
        />
      ))}

      {closed.length > 0 && (
        <details className="panel-card">
          <summary className="panel-head cursor-pointer list-none">
            <h4>
              {closed.length} resolved or waived issue{closed.length === 1 ? "" : "s"}
            </h4>
            <span>Show</span>
          </summary>
          <div className="panel-body flex flex-col gap-2.5">
            {closed.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                prominent={false}
                canWaive={false}
                reviewerName={reviewerName}
                onReviewerNameChange={onReviewerNameChange}
                onWaive={onWaive}
                busy={busy}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
