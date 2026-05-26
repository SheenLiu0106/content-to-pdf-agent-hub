import { useMemo, useState } from "react";
import type { UseCase, PdfRenderConfig } from "@shared/useCaseSchema";
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
import * as api from "../lib/api";

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

  const steps = useMemo(() => deriveSteps(phase, content !== null), [phase, content]);

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
      setContent(result);
      setPhase("preview");
    } catch (err) {
      const e = err as api.ApiError;
      setError(e.message ?? "Unknown error");
      setPhase("idle");
    }
  }

  async function handleGenerate() {
    if (!content) return;
    setError(null);
    setPhase("rendering");
    try {
      const { blob, filename } = await api.renderPdf(content, config);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPhase("done");
      setToast({
        title: "PDF generated successfully.",
        description: "Your customer case study PDF has been downloaded.",
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
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1320px] px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              SHEEN｜Content to PDF Agent Hub
            </h1>
            <p className="text-xs text-slate-600 sm:text-sm">
              Turn raw content into branded customer case study PDFs.
            </p>
          </div>
          <div className="mt-4">
            <StepBar current={steps.current} completed={steps.completed} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] flex-1 px-6 py-6">
        {error && (
          <div className="mb-6">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ============================ Left workspace ============================ */}
          <div className="flex flex-col gap-5">
            {!content && (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-100/60">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        Paste your content
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Article, memo, newsletter, meeting notes — anything that has the
                        makings of a customer story.
                      </p>
                    </div>
                    <span className="inline-flex flex-shrink-0 items-center rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                      Step 1
                    </span>
                  </div>
                  <PasteArea
                    value={raw}
                    onChange={setRaw}
                    onExtract={handleExtract}
                    loading={phase === "extracting"}
                  />
                </section>

                {supportingVisual}

                <section className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    What happens next?
                  </h3>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                    <li className="flex flex-col gap-1 rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                        1 · Extract
                      </span>
                      <span className="text-xs text-slate-600">
                        AI identifies Goals, Challenges, Solutions, and Results.
                      </span>
                    </li>
                    <li className="flex flex-col gap-1 rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                        2 · Edit
                      </span>
                      <span className="text-xs text-slate-600">
                        Review and tweak every section before generating.
                      </span>
                    </li>
                    <li className="flex flex-col gap-1 rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                        3 · Generate
                      </span>
                      <span className="text-xs text-slate-600">
                        Apply brand & assets, then export a branded PDF.
                      </span>
                    </li>
                  </ul>
                </section>
              </>
            )}

            {phase === "extracting" && (
              <LoadingState label="Identifying use case structure and generating Mermaid diagram…" />
            )}

            {content && (
              <>
                <section className="flex items-center justify-between gap-3 rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50/80 to-white px-5 py-3 shadow-sm">
                  <div>
                    <h2 className="text-sm font-semibold text-indigo-900">Review and edit</h2>
                    <p className="text-xs text-indigo-700/80">
                      AI extracted this content. Tweak anything before generating the PDF.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
                  >
                    ← Start over
                  </button>
                </section>

                <EditableUseCasePreview content={content} onChange={setContent} />

                {supportingVisual}

                {phase === "done" && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
                    PDF downloaded. Tweak settings or content and generate again.
                  </div>
                )}
              </>
            )}
          </div>

          {/* ============================ Right settings panel =========================== */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
            <TemplateGallery activeId={config.templateId} />

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100/60">
              <h3 className="text-sm font-semibold text-slate-900">Brand</h3>
              <div className="mt-3">
                <BrandSettingsPanel config={config} onChange={setConfig} embedded />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100/60">
              <h3 className="text-sm font-semibold text-slate-900">Assets</h3>
              <div className="mt-3 space-y-4">
                <LogoUpload
                  value={config.logoDataUrl}
                  onChange={(v) => setConfig({ ...config, logoDataUrl: v })}
                />
                <HeroImageUpload
                  value={config.heroImageDataUrl}
                  onChange={(v) => setConfig({ ...config, heroImageDataUrl: v })}
                />
              </div>
            </section>

            <ExportSummaryPanel
              hasContent={content !== null}
              rendering={phase === "rendering"}
              onGenerate={handleGenerate}
            />
          </aside>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-[1320px] px-6 py-3 text-center text-xs text-slate-400">
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
