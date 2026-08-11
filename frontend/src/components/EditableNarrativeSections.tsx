import type { ReactNode } from "react";
import type { NarrativeSection } from "@shared/useCaseSchema";

interface Props {
  sections: NarrativeSection[];
  onChange: (next: NarrativeSection[]) => void;
  // Optional per-section slot rendered below the body textarea. Used by
  // EditableArticleReportPreview to inject inline-visual controls; the
  // case-study and memo previews leave it undefined and get the original
  // body-only layout.
  renderAfterBody?: (sectionIndex: number) => ReactNode;
}

export default function EditableNarrativeSections({
  sections,
  onChange,
  renderAfterBody,
}: Props) {
  function update(i: number, patch: Partial<NarrativeSection>) {
    const next = sections.slice();
    next[i] = { ...next[i]!, ...patch };
    onChange(next);
  }

  function remove(i: number) {
    onChange(sections.filter((_, idx) => idx !== i));
  }

  function add() {
    onChange([...sections, { heading: "New Section", body: "" }]);
  }

  return (
    <section className="rounded-[9px] border border-hair bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-mute">
          Narrative Sections
        </h3>
        <button
          type="button"
          onClick={add}
          className="rounded-[6px] border border-hair-strong bg-white px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-shell-pane"
        >
          + Add section
        </button>
      </div>
      {sections.length === 0 ? (
        <p className="text-sm italic text-ink-faint">
          No narrative sections. Click "+ Add section" to start.
        </p>
      ) : (
        <div className="space-y-4">
          {sections.map((s, i) => (
            <div key={i} className="rounded-[7px] border border-hair bg-shell-pane p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="text"
                  value={s.heading}
                  onChange={(e) => update(i, { heading: e.target.value })}
                  placeholder="Section heading"
                  className="flex-1 rounded-[6px] border border-hair-strong bg-white px-2 py-1 text-sm font-semibold text-ink outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-500/20"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove section"
                  className="rounded px-2 py-1 text-xs font-medium text-alert-ink hover:bg-alert-tint"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={s.body}
                onChange={(e) => update(i, { body: e.target.value })}
                placeholder="Section body. Use blank lines to separate paragraphs."
                rows={6}
                className="w-full rounded-[6px] border border-hair bg-white px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-500/20"
              />
              {renderAfterBody && (
                <div className="mt-3">{renderAfterBody(i)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
