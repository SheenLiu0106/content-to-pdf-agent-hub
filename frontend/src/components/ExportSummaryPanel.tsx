import GeneratePdfButton from "./GeneratePdfButton";

interface Props {
  hasContent: boolean;
  rendering: boolean;
  onGenerate: () => void;
  templateLabel: string;
}

export default function ExportSummaryPanel({
  hasContent,
  rendering,
  onGenerate,
  templateLabel,
}: Props) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100/60">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Export</h3>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          PDF
        </span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-700">Template:</span>{" "}
        {templateLabel}
      </p>
      <div className="mt-3">
        <GeneratePdfButton
          onGenerate={onGenerate}
          loading={rendering}
          disabled={!hasContent}
        />
        {!hasContent && (
          <p className="mt-2 text-[11px] text-slate-400">
            Extract content first to enable PDF generation.
          </p>
        )}
      </div>
    </section>
  );
}
