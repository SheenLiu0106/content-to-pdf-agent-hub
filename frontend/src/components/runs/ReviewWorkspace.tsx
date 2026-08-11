import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PdfRenderConfig, UseCase } from "@shared/useCaseSchema";

import AgentDecisionBadges from "../AgentDecisionBadges";
import AgentWarningsPanel from "../AgentWarningsPanel";
import BrandSettingsPanel from "../BrandSettingsPanel";
import EditableUseCasePreview from "../EditableUseCasePreview";
import TemplatePicker from "../create/TemplatePicker";
import AgentProgress from "../agent/AgentProgress";
import AgentScope from "../agent/AgentScope";
import ContentOriginBadge from "../agent/ContentOriginBadge";
import { CanvasPane, Pane, PaneBody, PaneTitle, PaperSheet } from "../shell/Workspace";
import * as api from "../../lib/api";
import {
  agentPhase,
  CONSEQUENCES,
  contentOrigins,
  documentOrigin,
  ORIGIN_LABELS,
  runStages,
} from "../../lib/agentUx";
import { docAccentStyle } from "../../lib/docAccents";
import { getTemplateDefinition, type TemplateId } from "../../lib/templates";
import { formatTime, type RunIssue } from "../../lib/runTypes";
import ApprovalHistory from "./ApprovalHistory";
import DecisionForm, { ReviewerNameField } from "./DecisionForm";
import DocumentChecks from "./DocumentChecks";
import IssuesPanel from "./IssuesPanel";
import RunTimeline from "./RunTimeline";
import { Collapsible, InlineNotice, MetaField, MetaGrid, Section } from "./ui";

interface Props {
  detail: api.RunDetail;
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
  act: (action: api.RunActionRequest) => Promise<boolean>;
  inFlight: api.RunActionName | null;
  banners: ReactNode;
}

/**
 * The REVIEW gate: source and evidence on the left, the document on paper in the
 * centre, agent state and human decisions on the right.
 *
 * Edits are held as a local draft and only reach the server through an explicit
 * update_content / update_config action, after which the run is reloaded — both the
 * issue set and currentFingerprint change server-side on every save.
 */
export default function ReviewWorkspace({
  detail,
  reviewerName,
  onReviewerNameChange,
  act,
  inFlight,
  banners,
}: Props) {
  const { run } = detail;
  const busy = inFlight !== null;

  const [draft, setDraft] = useState<UseCase | null>(run.content);
  const [configDraft, setConfigDraft] = useState<PdfRenderConfig>(run.config);
  const [contentDirty, setContentDirty] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  // currentFingerprint covers content AND config, so it is the one value that tells us
  // the stored draft moved. Adopt the server's version only when the reviewer has
  // nothing unsaved — otherwise their typing would vanish under a background refresh.
  const adopted = useRef(detail.currentFingerprint);
  const dirty = contentDirty || configDirty;
  useEffect(() => {
    if (adopted.current === detail.currentFingerprint) return;
    adopted.current = detail.currentFingerprint;
    if (dirty) return;
    setDraft(run.content);
    setConfigDraft(run.config);
  }, [detail.currentFingerprint, dirty, run.content, run.config]);

  function discard() {
    setDraft(run.content);
    setConfigDraft(run.config);
    setContentDirty(false);
    setConfigDirty(false);
    setNormalizeError(null);
  }

  async function handleTemplateChange(id: TemplateId) {
    const def = getTemplateDefinition(id);
    setConfigDraft((c) => ({ ...c, templateId: id, documentLabel: def.documentLabel }));
    setConfigDirty(true);
    // Re-normalize for the new template, exactly as the interactive flow does, so the
    // editor shows the bullet policy the PDF will actually use instead of handing the
    // reviewer a fresh pile of render-validation issues.
    if (!draft) return;
    try {
      setDraft(await api.normalize(draft, id));
      setContentDirty(true);
      setNormalizeError(null);
    } catch (err) {
      setNormalizeError(
        (err as api.ApiError).message ?? "Could not re-normalize content for that template."
      );
    }
  }

  async function saveContent() {
    if (!draft) return;
    if (await act({ action: "update_content", content: draft })) setContentDirty(false);
  }

  async function saveConfig() {
    if (await act({ action: "update_config", config: configDraft })) setConfigDirty(false);
  }

  function waive(issue: RunIssue, note: string) {
    return act({
      action: "waive_issue",
      issueId: issue.id,
      expectedFindingFingerprint: issue.findingFingerprint,
      reviewerName: reviewerName.trim(),
      note,
    });
  }

  const blocked = detail.openBlockingCount > 0;
  const approveDisabledReason = blocked
    ? `${detail.openBlockingCount} blocking issue${detail.openBlockingCount === 1 ? "" : "s"} must be resolved or waived before this run can be approved.`
    : dirty
      ? "Save or discard your unsaved edits first — approval signs the stored version, not the draft on screen."
      : undefined;

  const origin = documentOrigin(detail);
  // Provenance the content itself carries. Findings are deliberately excluded here:
  // they are already presented as decisions in the right-hand pane, and listing them
  // twice would be noise rather than clarity.
  const contentProvenance = contentOrigins(detail).filter(
    (o) =>
      o.locator.startsWith("expansionNotes.") || o.locator.startsWith("missingFields.")
  );

  return (
    <>
      {/* ------------------------------ evidence ------------------------------ */}
      <Pane edge="right">
        <PaneTitle title="Source evidence" subtitle="Claims stay traceable to their origin." />
        <PaneBody>
          <Section
            title="Source document"
            subtitle={`${run.rawContent.length.toLocaleString()} characters`}
            action={<ContentOriginBadge kind="source" />}
          >
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-[6px] border border-hair-soft bg-white/70 p-2 font-sans text-[9.5px] leading-relaxed text-ink-soft">
              {run.rawContent}
            </pre>
          </Section>

          <Section
            title="Content origin"
            subtitle="Where this draft's content came from, as far as the agent recorded it."
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {origin.restructured && <ContentOriginBadge kind="restructured" />}
              {origin.expansions > 0 && (
                <ContentOriginBadge kind="expansion" count={origin.expansions} />
              )}
              {origin.unsupported > 0 && (
                <ContentOriginBadge kind="unsupported" count={origin.unsupported} />
              )}
              {origin.humanApproved && <ContentOriginBadge kind="human_approved" />}
            </div>

            {contentProvenance.length > 0 && (
              <dl className="decision-options mt-2.5">
                {contentProvenance.map((item) => (
                  <div key={item.locator}>
                    <dt>
                      {ORIGIN_LABELS[item.kind]}{" "}
                      <code className="font-normal text-ink-faint">{item.locator}</code>
                    </dt>
                    <dd>{item.text}</dd>
                  </div>
                ))}
              </dl>
            )}

            <p className="mt-2 text-[8.5px] leading-relaxed text-ink-mute">
              Unlabelled content is not certified as source-backed. This system records
              where the agent went <em>beyond</em> the source; it has no claim-level
              grounding check, so anything not flagged still needs your reading.
            </p>
          </Section>

          <Section title="Run metadata">
            <MetaGrid>
              <MetaField label="Created" value={formatTime(run.createdAt)} />
              <MetaField label="Updated" value={formatTime(run.updatedAt)} />
              <MetaField label="Extract attempts" value={run.extractAttempts} />
              <MetaField label="Render attempts" value={run.renderAttempts} />
            </MetaGrid>
          </Section>

          <div className="panel-card">
            <div className="panel-body">
              <TemplatePicker
                selectedId={configDraft.templateId}
                recommendedId={run.agent?.recommendedTemplate.id ?? null}
                onSelect={(id) => void handleTemplateChange(id)}
              />
            </div>
          </div>

          <Section title="Brand">
            <BrandSettingsPanel
              config={configDraft}
              onChange={(next) => {
                setConfigDraft(next);
                setConfigDirty(true);
              }}
              embedded
            />
          </Section>

          {run.agent && (
            <Section title="Agent decisions">
              <Collapsible summary="Full decision summary">
                <AgentDecisionBadges
                  intake={run.agent.intake}
                  strategy={run.agent.strategy}
                  layoutPlan={run.agent.layoutPlan}
                  warnings={run.agent.warnings}
                  effectiveTemplateId={configDraft.templateId}
                  agentRecommendedTemplateId={run.agent.recommendedTemplate.id}
                  isOverride={configDraft.templateId !== run.agent.recommendedTemplate.id}
                />
              </Collapsible>
            </Section>
          )}

          <AgentScope
            reviewPolicy={run.reviewPolicy}
            approvalMode={run.approvalMode}
            variant="compact"
          />
        </PaneBody>
      </Pane>

      {/* ------------------------------- canvas ------------------------------- */}
      <CanvasPane
        tools={
          <>
            <span className="tool-btn is-active">Editable draft</span>
            <span className="text-[8px] uppercase tracking-[0.08em] text-ink-mute">
              {getTemplateDefinition(configDraft.templateId).label}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              {dirty ? (
                <>
                  {contentDirty && (
                    <button type="button" onClick={() => void saveContent()} disabled={busy} className="btn accent sm">
                      {inFlight === "update_content" ? "Saving…" : "Save content"}
                    </button>
                  )}
                  {configDirty && (
                    <button type="button" onClick={() => void saveConfig()} disabled={busy} className="btn accent sm">
                      {inFlight === "update_config" ? "Saving…" : "Save configuration"}
                    </button>
                  )}
                  <button type="button" onClick={discard} disabled={busy} className="btn sm">
                    Discard
                  </button>
                </>
              ) : (
                <span className="text-[8px] uppercase tracking-[0.08em] text-ink-mute">
                  Saved
                </span>
              )}
            </span>
          </>
        }
      >
        {(banners || normalizeError) && (
          <div className="mx-auto mb-4 flex w-[min(720px,100%)] flex-col gap-2">
            {banners}
            {normalizeError && (
              <InlineNotice tone="danger" role="alert" title="Template change incomplete">
                {normalizeError}
              </InlineNotice>
            )}
          </div>
        )}

        {/* Origin at document level, beside the sheet rather than painted over it. */}
        {draft && (
          <div className="origin-strip">
            {origin.restructured && <ContentOriginBadge kind="restructured" />}
            {origin.expansions > 0 && (
              <ContentOriginBadge kind="expansion" count={origin.expansions} />
            )}
            {origin.unsupported > 0 && (
              <ContentOriginBadge kind="unsupported" count={origin.unsupported} />
            )}
            {origin.humanApproved && <ContentOriginBadge kind="human_approved" />}
            <span className="origin-note">
              {origin.expansions > 0
                ? `The agent restructured your source into this template and recorded ${origin.expansions} addition${origin.expansions === 1 ? "" : "s"} that go beyond it. Every field is editable.`
                : "The agent restructured your source into this template. Wording is the agent's; every field is editable."}
            </span>
          </div>
        )}

        {draft ? (
          <PaperSheet editorial className="overflow-hidden" style={docAccentStyle(configDraft)}>
            <EditableUseCasePreview
              content={draft}
              onChange={(next) => {
                setDraft(next);
                setContentDirty(true);
              }}
              documentLabel={configDraft.documentLabel}
              templateId={configDraft.templateId}
            />
          </PaperSheet>
        ) : (
          <PaperSheet pad editorial className="grid min-h-[24rem] place-items-center text-center">
            <p className="text-[11px] text-ink-mute">
              This run has no extracted content yet.
            </p>
          </PaperSheet>
        )}
      </CanvasPane>

      {/* ------------------------------ decisions ----------------------------- */}
      <Pane edge="left">
        <div className="px-3.5 pb-1 pt-3.5">
          <AgentProgress
            phase={agentPhase(run.status, run.paused)}
            stages={runStages(detail)}
            paused={run.paused}
            headline={blocked ? "Human decision required" : "Ready for your approval"}
            body={
              blocked
                ? `The agent stopped at the review gate: ${detail.openBlockingCount} blocking finding${detail.openBlockingCount === 1 ? "" : "s"} must be resolved or waived. It will not render until the gate clears.`
                : "No blocking findings remain. Approving sends the stored content to the render stage."
            }
            pauseNote={
              run.paused
                ? "This run is also paused, so the render stage will not start even once you approve. Resume it from the run header."
                : undefined
            }
          />
        </div>
        <PaneTitle title="Human decisions" subtitle="Each one is recorded against your name." />
        <PaneBody>
          <IssuesPanel
            issues={detail.issues}
            openBlockingCount={detail.openBlockingCount}
            canWaive
            reviewerName={reviewerName}
            onReviewerNameChange={onReviewerNameChange}
            onWaive={waive}
            busy={busy}
          />

          {run.agent && <AgentWarningsPanel warnings={run.agent.warnings} />}

          <DocumentChecks detail={detail} />

          <Section title="Review gate">
            <div className="flex flex-col gap-3.5">
              <ReviewerNameField value={reviewerName} onChange={onReviewerNameChange} />
              <DecisionForm
                hideReviewerField
                submitLabel="Approve review"
                confirmLabel="Confirm approve review"
                confirmPrompt="This sends the run to the render stage using the currently stored content and configuration."
                consequences={CONSEQUENCES.approve_review}
                tone="accent"
                noteRequired={false}
                noteLabel="Approval note"
                reviewerName={reviewerName}
                onReviewerNameChange={onReviewerNameChange}
                disabled={blocked || dirty}
                disabledReason={approveDisabledReason}
                busy={inFlight === "approve_gate"}
                onSubmit={(note) =>
                  act({
                    action: "approve_gate",
                    gate: "review",
                    reviewerName: reviewerName.trim(),
                    ...(note ? { note } : {}),
                    // Exactly the value from the most recent GET /api/runs/:id.
                    expectedFingerprint: detail.currentFingerprint,
                  })
                }
              />
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
