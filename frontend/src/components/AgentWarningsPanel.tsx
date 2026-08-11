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
    <section className="rounded-[9px] border border-review-line bg-review-tint p-4 shadow-sm ring-1 ring-review-line">
      <h3 className="text-sm font-semibold text-review-ink">Agent notes</h3>
      {inlineVisualSlots > 0 && (
        <p className="mt-2 text-xs text-review-ink">
          This article appears to reference a diagram or figure. You can upload
          an inline image, or dismiss the suggested slot.
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-review-ink">
          {warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <span className="select-none text-review-ink">•</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      {repairAttempts > 0 && (
        <div className="mt-3 border-t border-review-line/70 pt-2 text-[11px] text-review-ink">
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
