import type { UseCase, PullQuote } from "@shared/useCaseSchema";
import EditableBulletList from "./EditableBulletList";
import EditableNarrativeSections from "./EditableNarrativeSections";
import ExpansionNotesPanel from "./ExpansionNotesPanel";

interface Props {
  content: UseCase;
  onChange: (next: UseCase) => void;
  documentLabel: string;
}

function MetaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[6px] border border-hair bg-white px-3 py-1.5 text-sm text-ink shadow-sm outline-none transition-colors focus:border-ember-400 focus:ring-2 focus:ring-ember-500/20"
      />
    </label>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-mute">
      {children}
    </h3>
  );
}

export default function EditableCaseStudyPreview({
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

  return (
    <article className="overflow-hidden rounded-[9px] border border-hair bg-white shadow-sm ring-1 ring-hair-soft">
      {/* Document header — title + subtitle styled like a real document page */}
      <header className="border-b border-hair px-8 pb-7 pt-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ember-ink">
          {documentLabel}
        </div>
        <input
          type="text"
          value={content.title}
          onChange={(e) => patch("title", e.target.value)}
          placeholder="Untitled"
          className="mt-2 w-full border-0 bg-transparent p-0 text-2xl font-bold leading-tight tracking-tight text-ink outline-none placeholder:text-ink-faint focus:ring-0"
        />
        <input
          type="text"
          value={content.subtitle ?? ""}
          onChange={(e) => patch("subtitle", e.target.value || null)}
          placeholder="Add a subtitle…"
          className="mt-1 w-full border-0 bg-transparent p-0 text-base italic leading-snug text-ink-mute outline-none placeholder:text-ink-faint focus:ring-0"
        />

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetaField
            label="Solution / Technology"
            value={content.solutionName ?? ""}
            onChange={(v) => patch("solutionName", v || null)}
            placeholder="AI-Powered PI Tag Mapping"
          />
          <MetaField
            label="Industry"
            value={content.industry ?? ""}
            onChange={(v) => patch("industry", v || null)}
            placeholder="Power Generation"
          />
          <MetaField
            label="Use Case Focus"
            value={content.useCaseFocus ?? ""}
            onChange={(v) => patch("useCaseFocus", v || null)}
            placeholder="Consumption Forecasting"
          />
        </div>
      </header>

      {/* Body — single continuous document feel with sectioned content */}
      <div className="space-y-8 px-8 py-7">
        <ExpansionNotesPanel notes={content.expansionNotes} />

        <section>
          <SectionEyebrow>Page 1 summary</SectionEyebrow>
          <p className="mt-1 text-xs text-ink-mute">
            Four items in each list appear on the cover page.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <EditableBulletList
              title="Goals"
              accentVar="--doc-goals"
              items={content.goals}
              onChange={(v) => patch("goals", v)}
              placeholder="A goal or objective…"
            />
            <EditableBulletList
              title="Challenges"
              accentVar="--doc-challenge"
              items={content.challenges}
              onChange={(v) => patch("challenges", v)}
              placeholder="A challenge or pain point…"
            />
            <EditableBulletList
              title="Solutions"
              accentVar="--doc-solutions"
              items={content.solutions}
              onChange={(v) => patch("solutions", v)}
              placeholder="A solution or capability…"
            />
            <EditableBulletList
              title="Results"
              accentVar="--doc-results"
              items={content.results}
              onChange={(v) => patch("results", v)}
              placeholder="A result or outcome…"
            />
          </div>
        </section>

        <section>
          <SectionEyebrow>Executive summary</SectionEyebrow>
          <textarea
            value={content.executiveSummary}
            onChange={(e) => patch("executiveSummary", e.target.value)}
            rows={5}
            placeholder="A short, clear summary of the customer story…"
            className="mt-2 w-full rounded-[9px] border border-hair bg-shell-pane px-4 py-3 text-sm leading-relaxed text-ink shadow-inner outline-none transition-colors focus:border-ember-400 focus:bg-white focus:ring-2 focus:ring-ember-500/20"
          />
        </section>

        <EditableNarrativeSections
          sections={content.narrativeSections}
          onChange={(v) => patch("narrativeSections", v)}
        />

        <section>
          <div className="flex items-center justify-between gap-2">
            <SectionEyebrow>Pull quotes</SectionEyebrow>
            <button
              type="button"
              onClick={addPullQuote}
              className="rounded-[6px] border border-hair-strong bg-white px-3 py-1 text-xs font-semibold text-ink-soft shadow-sm hover:bg-shell-pane"
            >
              + Add quote
            </button>
          </div>
          {content.pullQuotes.length === 0 ? (
            <p className="mt-2 text-sm italic text-ink-faint">No pull quotes.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {content.pullQuotes.map((q, i) => (
                <div
                  key={i}
                  className="rounded-[9px] border border-hair bg-shell-pane p-3 shadow-inner"
                >
                  <textarea
                    value={q.quote}
                    onChange={(e) => updatePullQuote(i, { ...q, quote: e.target.value })}
                    placeholder="The quote text"
                    rows={2}
                    className="mb-2 w-full rounded-[6px] border border-hair bg-white px-2 py-1 text-sm italic text-ink outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-500/20"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={q.attribution ?? ""}
                      onChange={(e) =>
                        updatePullQuote(i, { ...q, attribution: e.target.value || null })
                      }
                      placeholder="Attribution (e.g., Jane Doe, CTO)"
                      className="flex-1 rounded-[6px] border border-hair-strong bg-white px-2 py-1 text-xs text-ink-soft outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => removePullQuote(i)}
                      className="rounded px-2 py-1 text-xs font-medium text-alert-ink hover:bg-alert-tint"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionEyebrow>Call to action</SectionEyebrow>
          <textarea
            value={content.callToAction ?? ""}
            onChange={(e) => patch("callToAction", e.target.value || null)}
            rows={3}
            placeholder="What should the reader do next?"
            className="mt-2 w-full rounded-[9px] border border-hair bg-shell-pane px-4 py-3 text-sm leading-relaxed text-ink shadow-inner outline-none transition-colors focus:border-ember-400 focus:bg-white focus:ring-2 focus:ring-ember-500/20"
          />
        </section>
      </div>
    </article>
  );
}
