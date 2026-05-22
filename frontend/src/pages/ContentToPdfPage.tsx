import { useState } from "react";
import type { Content } from "@shared/schema";
import PasteArea from "../components/PasteArea";
import ExtractionPreview from "../components/ExtractionPreview";
import GeneratePdfButton from "../components/GeneratePdfButton";
import LoadingState from "../components/LoadingState";
import ErrorBanner from "../components/ErrorBanner";
import * as api from "../lib/api";

type Phase = "idle" | "extracting" | "preview" | "rendering" | "done";

export default function ContentToPdfPage() {
  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const { blob, filename } = await api.renderPdf(content);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPhase("done");
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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Content to PDF</h1>
        <p className="mt-1 text-sm text-slate-600">
          Paste raw content. AI detects the type, extracts structure, and generates a branded PDF.
        </p>
      </header>

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {(phase === "idle" || phase === "extracting") && !content && (
        <PasteArea value={raw} onChange={setRaw} onExtract={handleExtract} loading={phase === "extracting"} />
      )}

      {phase === "extracting" && (
        <div className="mt-8">
          <LoadingState label="Identifying content type and extracting structure…" />
        </div>
      )}

      {content && (phase === "preview" || phase === "rendering" || phase === "done") && (
        <div className="flex flex-col gap-6">
          <ExtractionPreview content={content} />
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={handleReset}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              ← Start over
            </button>
            <GeneratePdfButton onGenerate={handleGenerate} loading={phase === "rendering"} />
          </div>
          {phase === "done" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              PDF downloaded. Generate again or start over to process new content.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
