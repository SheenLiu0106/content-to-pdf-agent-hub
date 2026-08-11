import { useState } from "react";
import type {
  InlineVisualBlock,
  PdfRenderConfig,
  UseCase,
} from "@shared/useCaseSchema";
import type {
  DocumentStrategy,
  IntakeAssessment,
  LayoutPlan,
} from "@shared/agentTypes";
import EditableUseCasePreview from "../components/EditableUseCasePreview";
import BrandSettingsPanel from "../components/BrandSettingsPanel";
import LogoUpload from "../components/LogoUpload";
import HeroImageUpload from "../components/HeroImageUpload";
import SupportingVisualSection from "../components/SupportingVisualSection";
import ErrorBanner from "../components/ErrorBanner";
import Toast from "../components/Toast";
import AgentDecisionBadges from "../components/AgentDecisionBadges";
import AgentWarningsPanel from "../components/AgentWarningsPanel";
import AppShell from "../components/shell/AppShell";
import type { AppView } from "../components/shell/SideNav";
import {
  CanvasPane,
  Pane,
  PaneBody,
  PaneTitle,
  PaperSheet,
  Workspace,
  WorkspaceBody,
  WorkspaceHead,
} from "../components/shell/Workspace";
import CreateIntake from "../components/create/CreateIntake";
import TemplatePicker from "../components/create/TemplatePicker";
import type { SourceMode } from "../components/create/SourceCard";
import { Collapsible, Section } from "../components/runs/ui";
import { hasUnresolvedSlots } from "../lib/inlineVisuals";
import { DEFAULT_CONFIG } from "../lib/defaultConfig";
import { docAccentStyle } from "../lib/docAccents";
import { validStaged, type StagedFile } from "../lib/stagedFiles";
import type { ApprovalMode, ReviewPolicy } from "../lib/runTypes";
import * as api from "../lib/api";
import {
  getTemplateDefinition,
  type TemplateDefinition,
  type TemplateId,
} from "../lib/templates";

/**
 * `intake` collects source + configuration; `draft` is the document review surface
 * that only exists once the agent has produced content. There is deliberately no
 * canvas during intake — nothing has been extracted yet.
 */
type Phase = "intake" | "submitting" | "draft" | "rendering" | "done";

interface Props {
  view: AppView;
  onViewChange: (next: AppView) => void;
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
}

export default function ContentToPdfPage({
  view,
  onViewChange,
  reviewerName,
  onReviewerNameChange,
}: Props) {
  const [mode, setMode] = useState<SourceMode>("single");
  const [phase, setPhase] = useState<Phase>("intake");

  // Intake state
  const [raw, setRaw] = useState("");
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [runName, setRunName] = useState("");
  const [reviewPolicy, setReviewPolicy] = useState<ReviewPolicy>("only_when_flagged");
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("required");
  const [config, setConfig] = useState<PdfRenderConfig>(DEFAULT_CONFIG);
  const [pendingInlineVisuals, setPendingInlineVisuals] = useState<InlineVisualBlock[]>([]);

  // Draft state
  const [content, setContent] = useState<UseCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ title: string; description?: string } | null>(null);
  const [intake, setIntake] = useState<IntakeAssessment | null>(null);
  const [strategy, setStrategy] = useState<DocumentStrategy | null>(null);
  const [layoutPlan, setLayoutPlan] = useState<LayoutPlan | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [repairAttempts, setRepairAttempts] = useState(0);
  const [repairActions, setRepairActions] = useState<string[]>([]);
  const [recommendedTemplate, setRecommendedTemplate] = useState<TemplateDefinition | null>(null);
  const [userSelectedTemplate, setUserSelectedTemplate] = useState<TemplateId | null>(null);

  // Template decision chain: the agent recommends a template, the user may override
  // it. `config.templateId` is the effective template and stays the single source of
  // truth for the preview and the PDF.
  const agentRecommendedTemplateId: TemplateId | null =
    recommendedTemplate?.id ?? strategy?.templateId ?? null;
  const isTemplateOverride =
    userSelectedTemplate != null &&
    agentRecommendedTemplateId != null &&
    userSelectedTemplate !== agentRecommendedTemplateId;

  const templateLabel = getTemplateDefinition(config.templateId).label;

  const supportingVisual = (
    <SupportingVisualSection
      config={config}
      onChange={setConfig}
      diagram={content?.mermaidDiagram ?? null}
      onDiagramChange={(d) =>
        setContent((prev) => (prev ? { ...prev, mermaidDiagram: d } : prev))
      }
    />
  );

  /** Single document: call the extraction agent, then open the draft review. */
  async function runExtraction() {
    setError(null);
    setPhase("submitting");
    try {
      const result = await api.extract(raw);
      const merged: UseCase = {
        ...result.content,
        inlineVisuals: [...(result.content.inlineVisuals ?? []), ...pendingInlineVisuals],
      };
      // /api/extract normalizes for the *recommended* template. A sticky manual pick is
      // re-normalized so the editor reflects the bullet policy the PDF will use.
      const effectiveTemplate = userSelectedTemplate ?? result.recommendedTemplate.id;
      const normalized =
        effectiveTemplate !== result.strategy.templateId
          ? await api.normalize(merged, effectiveTemplate)
          : merged;
      setContent(normalized);
      setPendingInlineVisuals([]);
      setIntake(result.intake);
      setStrategy(result.strategy);
      setLayoutPlan(result.layoutPlan);
      setWarnings(result.warnings);
      setRepairAttempts(0);
      setRepairActions([]);
      setRecommendedTemplate(result.recommendedTemplate);
      if (!userSelectedTemplate) {
        setConfig((c) => ({
          ...c,
          templateId: result.recommendedTemplate.id,
          documentLabel: result.recommendedTemplate.documentLabel,
        }));
      }
      setPhase("draft");
    } catch (err) {
      setError((err as api.ApiError).message ?? "Unknown error");
      setPhase("intake");
    }
  }

  /** Batch: create durable runs, then hand off to the Runs workbench. */
  async function createBatch() {
    setError(null);
    setPhase("submitting");
    try {
      await api.createBatch(
        validStaged(files).map((f) => ({ name: f.name, rawContent: f.rawContent as string })),
        {
          ...(runName.trim() ? { name: runName.trim() } : {}),
          reviewPolicy,
          approvalMode,
          config,
        }
      );
      setFiles([]);
      setPhase("intake");
      // Backend state and polling own every screen from here.
      onViewChange("runs");
    } catch (err) {
      setError((err as api.ApiError).message ?? "The batch could not be created.");
      setPhase("intake");
    }
  }

  async function handleTemplateChange(id: TemplateId) {
    const def = getTemplateDefinition(id);
    setUserSelectedTemplate(id);
    setConfig((c) => ({ ...c, templateId: id, documentLabel: def.documentLabel }));
    // Re-normalize the draft so the editor and the PDF stay in lockstep. Idempotent,
    // so switching templates preserves edits wherever counts already conform.
    if (content) {
      try {
        setContent(await api.normalize(content, id));
      } catch (err) {
        setError(
          (err as api.ApiError).message ??
            "Failed to re-normalize content for the selected template"
        );
      }
    }
  }

  async function handleGenerate() {
    if (!content) return;
    setError(null);
    setPhase("rendering");
    try {
      const { blob, filename, repairAttempts, repairActions } = await api.renderPdf(content, config);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setRepairAttempts(repairAttempts);
      setRepairActions(repairActions);
      setPhase("done");
      setToast({
        title: "PDF generated successfully.",
        description: "Your PDF has been downloaded.",
      });
    } catch (err) {
      setError((err as api.ApiError).message ?? "PDF generation failed");
      setPhase("draft");
    }
  }

  function resetToIntake() {
    setContent(null);
    setError(null);
    setRaw("");
    setFiles([]);
    setRunName("");
    setPhase("intake");
    setIntake(null);
    setStrategy(null);
    setLayoutPlan(null);
    setWarnings([]);
    setRepairAttempts(0);
    setRepairActions([]);
    setRecommendedTemplate(null);
    setUserSelectedTemplate(null);
    setPendingInlineVisuals([]);
  }

  const onIntake = phase === "intake" || phase === "submitting";

  return (
    <AppShell
      view={view}
      onViewChange={onViewChange}
      reviewerName={reviewerName}
      onReviewerNameChange={onReviewerNameChange}
      crumbs={["Create", onIntake ? "New run" : "Draft review"]}
      action={
        onIntake ? undefined : (
          <button type="button" onClick={resetToIntake} className="btn">
            New document
          </button>
        )
      }
    >
      {onIntake ? (
        <CreateIntake
          mode={mode}
          onModeChange={setMode}
          raw={raw}
          onRawChange={setRaw}
          onInlineImagesPasted={(visuals) =>
            setPendingInlineVisuals((prev) => [...prev, ...visuals])
          }
          pastedImageCount={pendingInlineVisuals.length}
          files={files}
          onFilesChange={setFiles}
          config={config}
          onConfigChange={setConfig}
          onTemplateChange={handleTemplateChange}
          runName={runName}
          onRunNameChange={setRunName}
          reviewPolicy={reviewPolicy}
          onReviewPolicyChange={setReviewPolicy}
          approvalMode={approvalMode}
          onApprovalModeChange={setApprovalMode}
          submitting={phase === "submitting"}
          error={error}
          onDismissError={() => setError(null)}
          onSubmit={() => void (mode === "single" ? runExtraction() : createBatch())}
          onClear={resetToIntake}
          onGoToRuns={() => onViewChange("runs")}
        />
      ) : (
        /* ---------------------- draft review workspace ---------------------- */
        <Workspace
          head={
            <WorkspaceHead
              title={content?.title || "Untitled draft"}
              subtitle="Agent-extracted draft · edit any field, then generate the PDF"
              actions={
                <>
                  <span className="status-pill t-draft">{templateLabel}</span>
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={!content || phase === "rendering"}
                    className="btn accent"
                  >
                    {phase === "rendering" ? "Generating…" : "Generate PDF"}
                  </button>
                </>
              }
            />
          }
        >
          <WorkspaceBody variant="two">
            <CanvasPane
              tools={
                <>
                  <span className="tool-btn is-active">Editable draft</span>
                  <span className="text-[8px] uppercase tracking-[0.08em] text-ink-mute">
                    {templateLabel}
                  </span>
                </>
              }
            >
              {error && (
                <div className="mx-auto mb-4 w-[min(720px,100%)]">
                  <ErrorBanner message={error} onDismiss={() => setError(null)} />
                </div>
              )}
              {content && (
                <PaperSheet editorial className="overflow-hidden" style={docAccentStyle(config)}>
                  <EditableUseCasePreview
                    content={content}
                    onChange={setContent}
                    documentLabel={config.documentLabel}
                    templateId={config.templateId}
                  />
                </PaperSheet>
              )}
              {phase === "done" && (
                <div className="mx-auto mt-4 w-[min(720px,100%)]">
                  <div className="notice t-ok">
                    PDF downloaded. Tweak settings or content and generate again.
                  </div>
                </div>
              )}
            </CanvasPane>

            <Pane edge="left">
              <PaneTitle title="Document setup" subtitle="Template, brand and assets." />
              <PaneBody>
                <div className="panel-card">
                  <div className="panel-body">
                    <TemplatePicker
                      selectedId={config.templateId}
                      recommendedId={recommendedTemplate?.id ?? null}
                      onSelect={(id) => void handleTemplateChange(id)}
                    />
                  </div>
                </div>

                <Section title="Brand">
                  <BrandSettingsPanel config={config} onChange={setConfig} embedded />
                </Section>

                <Section title="Assets">
                  <div className="flex flex-col gap-2.5">
                    <LogoUpload
                      value={config.logoDataUrl}
                      onChange={(v) => setConfig({ ...config, logoDataUrl: v })}
                    />
                    <HeroImageUpload
                      value={config.heroImageDataUrl}
                      onChange={(v) => setConfig({ ...config, heroImageDataUrl: v })}
                    />
                  </div>
                </Section>

                <div className="panel-card">
                  <div className="panel-body">{supportingVisual}</div>
                </div>

                {intake && strategy && layoutPlan && (
                  <Section title="Agent decisions">
                    <Collapsible summary="Full decision summary">
                      <AgentDecisionBadges
                        intake={intake}
                        strategy={strategy}
                        layoutPlan={layoutPlan}
                        warnings={warnings}
                        effectiveTemplateId={config.templateId}
                        agentRecommendedTemplateId={agentRecommendedTemplateId}
                        isOverride={isTemplateOverride}
                      />
                    </Collapsible>
                  </Section>
                )}

                <div className="[&:empty]:hidden">
                  <AgentWarningsPanel
                    warnings={[]}
                    repairAttempts={repairAttempts}
                    repairActions={repairActions}
                    inlineVisualSlots={
                      config.templateId === "article_report" &&
                      hasUnresolvedSlots(content?.inlineVisuals)
                        ? (content?.inlineVisuals ?? []).filter(
                            (v) =>
                              v.kind === "image_slot" &&
                              (v.status === "needs_upload" || v.status === "recommended")
                          ).length
                        : 0
                    }
                  />
                </div>
              </PaneBody>
            </Pane>
          </WorkspaceBody>
        </Workspace>
      )}

      {toast && (
        <Toast
          title={toast.title}
          description={toast.description}
          onDismiss={() => setToast(null)}
        />
      )}
    </AppShell>
  );
}
