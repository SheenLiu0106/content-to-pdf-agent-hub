import { useMemo, useState } from "react";
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
import PasteArea from "../components/PasteArea";
import EditableUseCasePreview from "../components/EditableUseCasePreview";
import BrandSettingsPanel from "../components/BrandSettingsPanel";
import LogoUpload from "../components/LogoUpload";
import HeroImageUpload from "../components/HeroImageUpload";
import SupportingVisualSection from "../components/SupportingVisualSection";
import ExportSummaryPanel from "../components/ExportSummaryPanel";
import LoadingState from "../components/LoadingState";
import ErrorBanner from "../components/ErrorBanner";
import Toast from "../components/Toast";
import StepBar, { type StepId } from "../components/StepBar";
import TemplateGallery from "../components/TemplateGallery";
import AgentDecisionBadges from "../components/AgentDecisionBadges";
import AgentWarningsPanel from "../components/AgentWarningsPanel";
import { hasUnresolvedSlots } from "../lib/inlineVisuals";
import * as api from "../lib/api";
import {
  getTemplateDefinition,
  type TemplateDefinition,
  type TemplateId,
} from "../lib/templates";

type Phase = "idle" | "extracting" | "preview" | "rendering" | "done";

const DEFAULT_CONFIG: PdfRenderConfig = {
  templateId: "usecase",
  brandName: "Your Company",
  brandWebsite: "www.example.com",
  documentLabel: "CUSTOMER CASE STUDY",
  brandCopyright: "© 2026 Your Company. All rights reserved.",
  primaryColor: "#0F172A",
  accentColor: "#06B6D4",
  logoDataUrl: null,
  heroImageDataUrl: null,
  supportingVisualEnabled: false,
  supportingVisualType: null,
  supportingImageDataUrl: null,
  supportingImageCaption: null,
  mermaidVerified: false,
  pdfLengthMode: "compact-2-page",
};

function deriveSteps(phase: Phase, hasContent: boolean): {
  current: StepId;
  completed: ReadonlySet<StepId>;
} {
  const done = new Set<StepId>();
  let current: StepId = "paste";
  switch (phase) {
    case "idle":
      current = "paste";
      break;
    case "extracting":
      done.add("paste");
      current = "extract";
      break;
    case "preview":
      done.add("paste");
      done.add("extract");
      current = "edit";
      break;
    case "rendering":
      done.add("paste");
      done.add("extract");
      done.add("edit");
      done.add("brand");
      current = "generate";
      break;
    case "done":
      done.add("paste");
      done.add("extract");
      done.add("edit");
      done.add("brand");
      done.add("generate");
      current = "generate";
      break;
  }
  if (!hasContent && phase === "idle") current = "paste";
  return { current, completed: done };
}

export default function ContentToPdfPage() {
  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [content, setContent] = useState<UseCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<PdfRenderConfig>(DEFAULT_CONFIG);
  const [toast, setToast] = useState<{ title: string; description?: string } | null>(null);
  const [intake, setIntake] = useState<IntakeAssessment | null>(null);
  const [strategy, setStrategy] = useState<DocumentStrategy | null>(null);
  const [layoutPlan, setLayoutPlan] = useState<LayoutPlan | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [repairAttempts, setRepairAttempts] = useState(0);
  const [repairActions, setRepairActions] = useState<string[]>([]);
  const [recommendedTemplate, setRecommendedTemplate] =
    useState<TemplateDefinition | null>(null);
  const [userSelectedTemplate, setUserSelectedTemplate] =
    useState<TemplateId | null>(null);
  const [pendingInlineVisuals, setPendingInlineVisuals] = useState<
    InlineVisualBlock[]
  >([]);

  // Template decision chain: the agent recommends a template, the user may
  // override it. `config.templateId` is the effective template (userSelected ??
  // agentRecommended) and stays the single source of truth for the preview/PDF.
  const agentRecommendedTemplateId: TemplateId | null =
    recommendedTemplate?.id ?? strategy?.templateId ?? null;
  const effectiveTemplateId = config.templateId;
  const isTemplateOverride =
    userSelectedTemplate != null &&
    agentRecommendedTemplateId != null &&
    userSelectedTemplate !== agentRecommendedTemplateId;

  const steps = useMemo(() => deriveSteps(phase, content !== null), [phase, content]);

  const substages = useMemo<string[] | undefined>(() => {
    if (phase === "extracting") {
      return ["Analyzing", "Planning", "Extracting", "Editing"];
    }
    if (phase === "rendering") {
      return ["Rendering", "Reviewing", "Repairing"];
    }
    return undefined;
  }, [phase]);

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

  async function handleExtract() {
    setError(null);
    setPhase("extracting");
    try {
      const result = await api.extract(raw);
      const mergedContent: UseCase = {
        ...result.content,
        inlineVisuals: [
          ...(result.content.inlineVisuals ?? []),
          ...pendingInlineVisuals,
        ],
      };
      // /api/extract normalizes content for the *recommended* template. If the
      // user has a sticky manual template selection that differs, re-normalize
      // for that template so the editor reflects the exact bullet policy the
      // PDF will use (single source of truth — no render-time surprise).
      const effectiveTemplate = userSelectedTemplate ?? result.recommendedTemplate.id;
      const normalizedContent =
        effectiveTemplate !== result.strategy.templateId
          ? await api.normalize(mergedContent, effectiveTemplate)
          : mergedContent;
      setContent(normalizedContent);
      setPendingInlineVisuals([]);
      setIntake(result.intake);
      setStrategy(result.strategy);
      setLayoutPlan(result.layoutPlan);
      setWarnings(result.warnings);
      setRepairAttempts(0);
      setRepairActions([]);
      setRecommendedTemplate(result.recommendedTemplate);
      // Auto-apply the agent's recommendation only if the user hasn't
      // already overridden the template choice this session. Manual picks
      // stick across re-extracts so the user doesn't lose their selection.
      if (!userSelectedTemplate) {
        setConfig((c) => ({
          ...c,
          templateId: result.recommendedTemplate.id,
          documentLabel: result.recommendedTemplate.documentLabel,
        }));
      }
      setPhase("preview");
    } catch (err) {
      const e = err as api.ApiError;
      setError(e.message ?? "Unknown error");
      setPhase("idle");
    }
  }

  async function handleTemplateChange(id: TemplateId) {
    const def = getTemplateDefinition(id);
    setUserSelectedTemplate(id);
    setConfig((c) => ({
      ...c,
      templateId: id,
      documentLabel: def.documentLabel,
    }));
    // Re-normalize the editable content for the newly selected template so the
    // editor + preview immediately match what the PDF will render. The
    // normalization is deterministic and idempotent, so re-applying it across
    // template switches preserves user edits whenever counts already conform.
    if (content) {
      try {
        const normalized = await api.normalize(content, id);
        setContent(normalized);
      } catch (err) {
        const e = err as api.ApiError;
        setError(e.message ?? "Failed to re-normalize content for the selected template");
      }
    }
  }

  async function handleGenerate() {
    if (!content) return;
    setError(null);
    setPhase("rendering");
    try {
      const { blob, filename, repairAttempts, repairActions } = await api.renderPdf(
        content,
        config
      );
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
      const e = err as api.ApiError;
      setError(e.message ?? "PDF generation failed");
      setPhase("preview");
    }
  }

  function handleReset() {
    setContent(null);
    setError(null);
    setRaw("");
    setPhase("idle");
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

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white text-slate-900">
      {/* ===== Slim top navigation: brand left, stepper far right ===== */}
      <header className="sticky top-0 z-30 animate-fade-up border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="flex min-h-[4.5rem] items-center justify-between gap-8 px-6 py-3 lg:px-12">
          <div className="flex items-center gap-3.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-[0_0_0_4px_rgba(99,102,241,0.1)]" />
            <h1 className="text-[22px] font-extrabold leading-none tracking-[-0.02em] sm:text-[26px]">
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent">
                SHEEN
              </span>
              <span className="mx-2 align-middle text-lg font-light text-slate-300">
                ／
              </span>
              <span className="font-bold text-slate-900">Content to PDF</span>
            </h1>
            {/* Clean hairline divider + refined "Agent Hub" badge */}
            <span aria-hidden="true" className="hidden h-5 w-px bg-slate-200 sm:block" />
            <span className="hidden items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.2em] text-indigo-500/80 ring-1 ring-inset ring-indigo-500/15 sm:inline-flex">
              Agent Hub
            </span>
          </div>
          <div className="hidden w-full max-w-[460px] md:block">
            <StepBar
              current={steps.current}
              completed={steps.completed}
              substages={substages}
            />
          </div>
        </div>
      </header>

      {/* ===== Unified split-pane: white workspace + tinted settings rail ===== */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------------------------- Left workspace --------------------------- */}
        <main className="px-6 py-8 lg:px-12 lg:py-9">
          {error && (
            <div className="mb-8">
              <ErrorBanner message={error} onDismiss={() => setError(null)} />
            </div>
          )}

          {!content && (
            <div className="flex flex-col">
              <section>
                <span className="block animate-fade-up text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-500/90 [animation-delay:80ms]">
                  Step 01
                </span>
                <h2 className="mt-1 animate-fade-up text-2xl font-extrabold tracking-tight text-slate-900 [animation-delay:120ms]">
                  Paste your content
                </h2>
                <p className="mt-1.5 max-w-lg animate-fade-up text-sm leading-relaxed text-slate-500 [animation-delay:160ms]">
                  Article, memo, newsletter, meeting notes — anything that has the
                  makings of a customer story.
                </p>
                <div className="mt-5 animate-fade-up [animation-delay:220ms]">
                  <PasteArea
                    value={raw}
                    onChange={setRaw}
                    onExtract={handleExtract}
                    loading={phase === "extracting"}
                    pastedImageCount={pendingInlineVisuals.length}
                    onInlineImagesPasted={(visuals) =>
                      setPendingInlineVisuals((prev) => [...prev, ...visuals])
                    }
                  />
                </div>
              </section>

              <div className="mt-8 animate-fade-up border-t border-slate-200/70 pt-8 [animation-delay:300ms]">
                {supportingVisual}
              </div>

              <section className="mt-8 animate-fade-up border-t border-slate-200/70 pt-8 [animation-delay:360ms]">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  What happens next
                </h3>
                <ul className="mt-7 grid gap-x-10 gap-y-8 sm:grid-cols-3">
                  {[
                    {
                      n: "01",
                      title: "Extract",
                      body: "AI identifies Goals, Challenges, Solutions, and Results.",
                    },
                    {
                      n: "02",
                      title: "Edit",
                      body: "Review and tweak every section before generating.",
                    },
                    {
                      n: "03",
                      title: "Generate",
                      body: "Apply brand & assets, then export a branded PDF.",
                    },
                  ].map((item) => (
                    <li key={item.n} className="flex flex-col gap-2">
                      <span className="bg-gradient-to-br from-indigo-500 to-cyan-400 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
                        {item.n}
                      </span>
                      <span className="text-sm font-bold tracking-tight text-slate-900">
                        {item.title}
                      </span>
                      <span className="text-[13px] leading-relaxed text-slate-500">
                        {item.body}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {phase === "extracting" && (
            <div className="animate-fade-up">
              <LoadingState label="Identifying use case structure and generating Mermaid diagram…" />
            </div>
          )}

          {content && (
            <div className="flex flex-col">
              <section className="flex animate-fade-up items-start justify-between gap-4 border-b border-slate-200/70 pb-6 [animation-delay:60ms]">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                    Review and edit
                  </h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                    AI extracted this content. Tweak anything before generating the
                    PDF.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="group inline-flex flex-shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold text-slate-500 transition-all duration-500 ease-spring hover:bg-slate-500/[0.06] hover:text-slate-700 active:scale-[0.97]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5 transition-transform duration-500 ease-spring group-hover:-translate-x-0.5"
                    aria-hidden="true"
                  >
                    <path d="M19 12H5m6-6-6 6 6 6" />
                  </svg>
                  Start over
                </button>
              </section>

              {intake && strategy && layoutPlan && (
                <div className="mt-6 animate-fade-up [animation-delay:120ms]">
                  <AgentDecisionBadges
                    intake={intake}
                    strategy={strategy}
                    layoutPlan={layoutPlan}
                    warnings={warnings}
                    effectiveTemplateId={effectiveTemplateId}
                    agentRecommendedTemplateId={agentRecommendedTemplateId}
                    isOverride={isTemplateOverride}
                  />
                </div>
              )}

              {/* The preview represents the printed page — a single, restrained
                  frame, never a stack of nested bezels. */}
              <div className="mt-6 animate-fade-up overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft-sm [animation-delay:180ms]">
                <EditableUseCasePreview
                  content={content}
                  onChange={setContent}
                  documentLabel={config.documentLabel}
                  templateId={config.templateId}
                />
              </div>

              <div className="mt-8 animate-fade-up border-t border-slate-200/70 pt-8 [animation-delay:240ms]">
                {supportingVisual}
              </div>

              {phase === "done" && (
                <div className="mt-8 flex items-center gap-2.5 rounded-xl bg-emerald-500/[0.08] px-5 py-4 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-400/20">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3 w-3"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.07 7.146a1 1 0 0 1-1.42.006L3.29 8.95a1 1 0 1 1 1.42-1.408l3.215 3.244 6.36-6.43a1 1 0 0 1 1.42-.066Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  PDF downloaded. Tweak settings or content and generate again.
                </div>
              )}
            </div>
          )}
        </main>

        {/* --------------------------- Right settings rail -------------------------- */}
        {/* Separated by a single hairline + a microscopic background shift —
            no shadows, no floating cards, no column gap. */}
        <aside className="border-t border-slate-200/80 bg-[#F7F7F8] lg:border-l lg:border-t-0">
          <div className="divide-y divide-slate-200/70 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-4.5rem)] lg:overflow-y-auto">
            <div className="animate-fade-up px-6 py-7 [animation-delay:160ms] lg:px-8">
              <TemplateGallery
                selectedId={config.templateId}
                recommendedId={recommendedTemplate?.id ?? null}
                onSelect={handleTemplateChange}
              />
            </div>

            <div className="animate-fade-up px-6 py-7 [animation-delay:240ms] lg:px-8">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Brand
              </h3>
              <div className="mt-4">
                <BrandSettingsPanel config={config} onChange={setConfig} embedded />
              </div>
            </div>

            <div className="animate-fade-up px-6 py-7 [animation-delay:320ms] lg:px-8">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Assets
              </h3>
              <div className="mt-4 space-y-4">
                <LogoUpload
                  value={config.logoDataUrl}
                  onChange={(v) => setConfig({ ...config, logoDataUrl: v })}
                />
                <HeroImageUpload
                  value={config.heroImageDataUrl}
                  onChange={(v) => setConfig({ ...config, heroImageDataUrl: v })}
                />
              </div>
            </div>

            <div className="px-6 py-7 lg:px-8 [&:empty]:hidden">
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
                          (v.status === "needs_upload" ||
                            v.status === "recommended")
                      ).length
                    : 0
                }
              />
            </div>

            <div className="sticky bottom-0 animate-fade-up bg-[#F7F7F8]/95 px-6 py-7 backdrop-blur-sm [animation-delay:400ms] lg:px-8">
              <ExportSummaryPanel
                hasContent={content !== null}
                rendering={phase === "rendering"}
                onGenerate={handleGenerate}
                templateLabel={getTemplateDefinition(config.templateId).label}
              />
            </div>
          </div>
        </aside>
      </div>

      <footer className="border-t border-slate-200/80 px-6 py-5 lg:px-12">
        <div className="text-[11px] tracking-wide text-slate-400">
          © 2026 Sheen Liu. All rights reserved.
        </div>
      </footer>

      {toast && (
        <Toast
          title={toast.title}
          description={toast.description}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
