import { useState } from "react";
import type {
  MermaidDiagram,
  PdfRenderConfig,
  SupportingVisualType,
} from "@shared/useCaseSchema";
import SupportingImageUpload from "./SupportingImageUpload";
import * as api from "../lib/api";

interface Props {
  config: PdfRenderConfig;
  onChange: (next: PdfRenderConfig) => void;
  diagram: MermaidDiagram | null;
  onDiagramChange: (next: MermaidDiagram | null) => void;
}

const DEFAULT_DIAGRAM: MermaidDiagram = {
  title: "Process Flow",
  code: "flowchart LR\n  A[Input] --> B[Transform] --> C[Output]",
  description: null,
};

type TestStatus =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ready"; svg: string }
  | { state: "failed" }
  | { state: "stale" };

function patchConfig<K extends keyof PdfRenderConfig>(
  config: PdfRenderConfig,
  key: K,
  value: PdfRenderConfig[K]
): PdfRenderConfig {
  return { ...config, [key]: value };
}

export default function SupportingVisualSection({
  config,
  onChange,
  diagram,
  onDiagramChange,
}: Props) {
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: "idle" });

  const enabled = config.supportingVisualEnabled;
  const type: SupportingVisualType | null = config.supportingVisualType;

  function resetTest(nextConfig: PdfRenderConfig): PdfRenderConfig {
    setTestStatus({ state: "idle" });
    return { ...nextConfig, mermaidVerified: false };
  }

  function toggleEnabled(next: boolean) {
    if (!next) {
      onChange(
        resetTest({
          ...config,
          supportingVisualEnabled: false,
        })
      );
      return;
    }
    onChange(
      resetTest({
        ...config,
        supportingVisualEnabled: true,
        supportingVisualType: type ?? "image",
      })
    );
  }

  function chooseType(next: SupportingVisualType) {
    onChange(resetTest({ ...config, supportingVisualType: next }));
    if (next === "mermaid" && !diagram) {
      onDiagramChange(DEFAULT_DIAGRAM);
    }
  }

  async function handleTest() {
    if (!diagram?.code) {
      setTestStatus({ state: "failed" });
      onChange({ ...config, mermaidVerified: false });
      return;
    }
    setTestStatus({ state: "testing" });
    try {
      const result = await api.validateMermaid(diagram.code);
      if (result.ok && result.svg) {
        setTestStatus({ state: "ready", svg: result.svg });
        onChange({ ...config, mermaidVerified: true });
      } else {
        setTestStatus({ state: "failed" });
        onChange({ ...config, mermaidVerified: false });
      }
    } catch {
      setTestStatus({ state: "failed" });
      onChange({ ...config, mermaidVerified: false });
    }
  }

  function updateDiagram(p: Partial<MermaidDiagram>) {
    const base = diagram ?? DEFAULT_DIAGRAM;
    onDiagramChange({ ...base, ...p });
    if (Object.prototype.hasOwnProperty.call(p, "code")) {
      setTestStatus((prev) =>
        prev.state === "ready" ? { state: "stale" } : { state: "idle" }
      );
      if (config.mermaidVerified) {
        onChange({ ...config, mermaidVerified: false });
      }
    }
  }

  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Supporting Visual
      </h3>

      <label className="mt-4 flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span>Include supporting visual section</span>
      </label>

      {enabled && (
        <>
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Visual Type
            </legend>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="radio"
                  name="supporting-visual-type"
                  value="image"
                  checked={type === "image"}
                  onChange={() => chooseType("image")}
                  className="h-3.5 w-3.5 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Uploaded image
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="radio"
                  name="supporting-visual-type"
                  value="mermaid"
                  checked={type === "mermaid"}
                  onChange={() => chooseType("mermaid")}
                  className="h-3.5 w-3.5 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Mermaid diagram
              </label>
            </div>
          </fieldset>

          {type === "image" && (
            <div className="mt-3 space-y-3">
              <SupportingImageUpload
                value={config.supportingImageDataUrl}
                onChange={(v) =>
                  onChange(patchConfig(config, "supportingImageDataUrl", v))
                }
              />
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Caption / title
                </span>
                <input
                  type="text"
                  value={config.supportingImageCaption ?? ""}
                  onChange={(e) =>
                    onChange(
                      patchConfig(
                        config,
                        "supportingImageCaption",
                        e.target.value || null
                      )
                    )
                  }
                  placeholder="Operational Impact Pathway"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>
          )}

          {type === "mermaid" && (
            <div className="mt-3 space-y-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Title
                </span>
                <input
                  type="text"
                  value={(diagram ?? DEFAULT_DIAGRAM).title}
                  onChange={(e) => updateDiagram({ title: e.target.value })}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Description (optional)
                </span>
                <input
                  type="text"
                  value={(diagram ?? DEFAULT_DIAGRAM).description ?? ""}
                  onChange={(e) =>
                    updateDiagram({ description: e.target.value || null })
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Mermaid code
                </span>
                <textarea
                  value={(diagram ?? DEFAULT_DIAGRAM).code}
                  onChange={(e) => updateDiagram({ code: e.target.value })}
                  rows={6}
                  spellCheck={false}
                  className="w-full rounded-md border border-slate-300 bg-slate-900 px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleTest()}
                  disabled={testStatus.state === "testing"}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {testStatus.state === "testing" ? "Testing…" : "Test diagram"}
                </button>
                {testStatus.state === "ready" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                    <span aria-hidden>✓</span> Diagram ready
                  </span>
                )}
                {testStatus.state === "failed" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                    Diagram failed — it will be omitted from PDF
                  </span>
                )}
                {testStatus.state === "stale" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                    Needs retest
                  </span>
                )}
                {testStatus.state === "idle" && (
                  <span className="text-[11px] text-slate-500">
                    Untested — click <em>Test diagram</em> to include in PDF.
                  </span>
                )}
              </div>
              {testStatus.state === "ready" && (
                <div
                  className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white p-3 [&_svg]:mx-auto [&_svg]:block [&_svg]:max-h-64 [&_svg]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: testStatus.svg }}
                />
              )}
              <p className="text-[11px] text-slate-500">
                Use <code className="font-mono">flowchart LR</code> or{" "}
                <code className="font-mono">flowchart TD</code>. Complex syntax may
                not render.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
