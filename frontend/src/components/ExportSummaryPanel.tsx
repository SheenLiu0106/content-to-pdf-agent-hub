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
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Export
        </h3>
        <span className="inline-flex items-center rounded-full bg-slate-900/[0.05] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          PDF
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-700">Template</span>
        <span className="mx-1.5 text-slate-300">·</span>
        {templateLabel}
      </p>
      <div className="mt-4">
        <GeneratePdfButton
          onGenerate={onGenerate}
          loading={rendering}
          disabled={!hasContent}
        />
        {!hasContent && (
          <p className="mt-2.5 text-center text-[11px] text-slate-400">
            Extract content first to enable PDF generation.
          </p>
        )}
      </div>
    </section>
  );
}
