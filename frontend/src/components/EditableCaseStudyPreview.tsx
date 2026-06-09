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
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
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
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100/60">
      {/* Document header — title + subtitle styled like a real document page */}
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
          placeholder="Add a subtitle…"
          className="mt-1 w-full border-0 bg-transparent p-0 text-base italic leading-snug text-slate-500 outline-none placeholder:text-slate-300 focus:ring-0"
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
          <p className="mt-1 text-xs text-slate-500">
            Four items in each list appear on the cover page.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <EditableBulletList
              title="Goals"
              accentClass="border-t-cyan-500"
              items={content.goals}
              onChange={(v) => patch("goals", v)}
              placeholder="A goal or objective…"
            />
            <EditableBulletList
              title="Challenges"
              accentClass="border-t-amber-500"
              items={content.challenges}
              onChange={(v) => patch("challenges", v)}
              placeholder="A challenge or pain point…"
            />
            <EditableBulletList
              title="Solutions"
              accentClass="border-t-slate-800"
              items={content.solutions}
              onChange={(v) => patch("solutions", v)}
              placeholder="A solution or capability…"
            />
            <EditableBulletList
              title="Results"
              accentClass="border-t-emerald-500"
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
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-inner outline-none transition-colors focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
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
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              + Add quote
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
                    placeholder="The quote text"
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

        <section>
          <SectionEyebrow>Call to action</SectionEyebrow>
          <textarea
            value={content.callToAction ?? ""}
            onChange={(e) => patch("callToAction", e.target.value || null)}
            rows={3}
            placeholder="What should the reader do next?"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-inner outline-none transition-colors focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </section>
      </div>
    </article>
  );
}
