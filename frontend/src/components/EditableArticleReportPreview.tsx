import type {
  InlineVisualBlock,
  NarrativeSection,
  PullQuote,
  UseCase,
} from "@shared/useCaseSchema";
import EditableBulletList from "./EditableBulletList";
import EditableNarrativeSections from "./EditableNarrativeSections";
import ExpansionNotesPanel from "./ExpansionNotesPanel";
import InlineVisualEditor from "./InlineVisualEditor";
import {
  mintInlineVisualId,
  reindexInlineVisualsForSectionRemoval,
} from "../lib/inlineVisuals";

interface Props {
  content: UseCase;
  onChange: (next: UseCase) => void;
  documentLabel: string;
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
      {children}
    </h3>
  );
}

export default function EditableArticleReportPreview({
  content,
  onChange,
  documentLabel,
}: Props) {
  function patch<K extends keyof UseCase>(key: K, value: UseCase[K]) {
    onChange({ ...content, [key]: value });
  }

  function updatePullQuote(i: number, next: PullQuote) {
    const list = content.pullQuotes.slice();
    list[i] = next;
    patch("pullQuotes", list);
  }

  function removePullQuote(i: number) {
    patch(
      "pullQuotes",
      content.pullQuotes.filter((_, idx) => idx !== i)
    );
  }

  function addPullQuote() {
    patch("pullQuotes", [...content.pullQuotes, { quote: "", attribution: null }]);
  }

  // Section delete: shift inline visuals' sectionIndex to match the new
  // section layout. Filter() in EditableNarrativeSections keeps the original
  // section references, so the first index where prev[i] !== next[i] is the
  // one that was removed.
  function handleSectionsChange(next: NarrativeSection[]) {
    const prev = content.narrativeSections;
    if (next.length < prev.length) {
      let removedIndex = prev.length - 1;
      for (let i = 0; i < next.length; i++) {
        if (prev[i] !== next[i]) {
          removedIndex = i;
          break;
        }
      }
      const reindexed = reindexInlineVisualsForSectionRemoval(
        content.inlineVisuals ?? [],
        removedIndex,
        next.length
      );
      onChange({
        ...content,
        narrativeSections: next,
        inlineVisuals: reindexed,
      });
      return;
    }
    patch("narrativeSections", next);
  }

  function updateInlineVisual(next: InlineVisualBlock) {
    const list = (content.inlineVisuals ?? []).map((v) =>
      v.id === next.id ? next : v
    );
    patch("inlineVisuals", list);
  }

  function removeInlineVisual(id: string) {
    patch(
      "inlineVisuals",
      (content.inlineVisuals ?? []).filter((v) => v.id !== id)
    );
  }

  function addInlineVisualSlot(sectionIndex: number) {
    const slot: InlineVisualBlock = {
      id: mintInlineVisualId(),
      kind: "image_slot",
      sourceType: "missing",
      sectionIndex,
      placement: "after_section",
      status: "needs_upload",
    };
    patch("inlineVisuals", [...(content.inlineVisuals ?? []), slot]);
  }

  function renderInlineVisualsForSection(sectionIndex: number) {
    const sectionVisuals = (content.inlineVisuals ?? []).filter(
      (v) => v.sectionIndex === sectionIndex
    );
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Inline images
          </span>
          <button
            type="button"
            onClick={() => addInlineVisualSlot(sectionIndex)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            + Add inline image
          </button>
        </div>
        {sectionVisuals.length === 0 ? (
          <p className="text-[11px] italic text-slate-400">
            No inline images for this section.
          </p>
        ) : (
          <div className="space-y-2">
            {sectionVisuals.map((v) => (
              <InlineVisualEditor
                key={v.id}
                visual={v}
                onChange={updateInlineVisual}
                onRemove={() => removeInlineVisual(v.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100/60">
      <header className="border-b border-slate-200 px-8 pb-7 pt-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
          {documentLabel}
        </div>
        <input
          type="text"
          value={content.title}
          onChange={(e) => patch("title", e.target.value)}
          placeholder="Untitled"
          className="mt-2 w-full border-0 bg-transparent p-0 text-2xl font-bold leading-tight tracking-tight text-slate-900 outline-none placeholder:text-slate-300 focus:ring-0"
        />
        <input
          type="text"
          value={content.subtitle ?? ""}
          onChange={(e) => patch("subtitle", e.target.value || null)}
          placeholder="Add a deck / subtitle…"
          className="mt-1 w-full border-0 bg-transparent p-0 text-base italic leading-snug text-slate-500 outline-none placeholder:text-slate-300 focus:ring-0"
        />
      </header>

      <div className="space-y-8 px-8 py-7">
        <ExpansionNotesPanel notes={content.expansionNotes} />

        <section>
          <SectionEyebrow>Key takeaways</SectionEyebrow>
          <p className="mt-1 text-xs text-slate-500">
            Headline points the reader should walk away with.
          </p>
          <div className="mt-3">
            <EditableBulletList
              title="Takeaways"
              accentClass="border-t-emerald-500"
              items={content.results}
              onChange={(v) => patch("results", v)}
              placeholder="A key takeaway…"
            />
          </div>
        </section>

        <section>
          <SectionEyebrow>Intro / Executive summary</SectionEyebrow>
          <textarea
            value={content.executiveSummary}
            onChange={(e) => patch("executiveSummary", e.target.value)}
            rows={5}
            placeholder="Lead the reader in: what is this article about and why does it matter?"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-inner outline-none transition-colors focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </section>

        <EditableNarrativeSections
          sections={content.narrativeSections}
          onChange={handleSectionsChange}
          renderAfterBody={renderInlineVisualsForSection}
        />

        <section>
          <div className="flex items-center justify-between gap-2">
            <SectionEyebrow>Pull quotes / callouts</SectionEyebrow>
            <button
              type="button"
              onClick={addPullQuote}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              + Add callout
            </button>
          </div>
          {content.pullQuotes.length === 0 ? (
            <p className="mt-2 text-sm italic text-slate-400">No pull quotes.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {content.pullQuotes.map((q, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 shadow-inner"
                >
                  <textarea
                    value={q.quote}
                    onChange={(e) => updatePullQuote(i, { ...q, quote: e.target.value })}
                    placeholder="The quote or callout text"
                    rows={2}
                    className="mb-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm italic text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={q.attribution ?? ""}
                      onChange={(e) =>
                        updatePullQuote(i, { ...q, attribution: e.target.value || null })
                      }
                      placeholder="Attribution (e.g., Jane Doe, CTO)"
                      className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <button
                      type="button"
                      onClick={() => removePullQuote(i)}
                      className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
