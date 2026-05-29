interface Props {
  warnings: string[];
  repairAttempts?: number;
  repairActions?: string[];
  // When > 0, render a dedicated non-blocking banner about article-report
  // image slots the user hasn't resolved yet. Read by ContentToPdfPage from
  // content.inlineVisuals; only article_report should ever pass > 0.
  inlineVisualSlots?: number;
}

const REPAIR_ACTION_LABELS: Record<string, string> = {
  switch_cover_density: "Adjusted cover density",
  omit_supporting_visual: "Omitted supporting visual",
  repair_sentence_fragments: "Repaired sentence fragments",
  compress_narrative: "Compressed narrative",
  rerender_pdf: "Re-rendered PDF",
};

export default function AgentWarningsPanel({
  warnings,
  repairAttempts = 0,
  repairActions = [],
  inlineVisualSlots = 0,
}: Props) {
  if (warnings.length === 0 && repairAttempts === 0 && inlineVisualSlots === 0)
    return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm ring-1 ring-amber-100/60">
      <h3 className="text-sm font-semibold text-amber-900">Agent notes</h3>
      {inlineVisualSlots > 0 && (
        <p className="mt-2 text-xs text-amber-800">
          This article appears to reference a diagram or figure. You can upload
          an inline image, or dismiss the suggested slot.
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-800">
          {warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <span className="select-none text-amber-500">•</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      {repairAttempts > 0 && (
        <div className="mt-3 border-t border-amber-200/70 pt-2 text-[11px] text-amber-700">
          <span className="font-semibold">
            Last render: {repairAttempts} repair attempt
            {repairAttempts === 1 ? "" : "s"}.
          </span>
          {repairActions.length > 0 && (
            <span className="ml-1">
              {repairActions.map((a) => REPAIR_ACTION_LABELS[a] ?? a).join(", ")}.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
