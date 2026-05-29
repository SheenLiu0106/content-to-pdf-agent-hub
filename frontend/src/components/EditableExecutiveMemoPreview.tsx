import type { UseCase, NarrativeSection } from "@shared/useCaseSchema";
import EditableBulletList from "./EditableBulletList";
import ExpansionNotesPanel from "./ExpansionNotesPanel";

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

function EditableSection({
  section,
  onChange,
  headingPlaceholder,
  bodyPlaceholder,
}: {
  section: NarrativeSection;
  onChange: (next: NarrativeSection) => void;
  headingPlaceholder: string;
  bodyPlaceholder: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <input
        type="text"
        value={section.heading}
        onChange={(e) => onChange({ ...section, heading: e.target.value })}
        placeholder={headingPlaceholder}
        className="mb-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
      <textarea
        value={section.body}
        onChange={(e) => onChange({ ...section, body: e.target.value })}
        placeholder={bodyPlaceholder}
        rows={5}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  );
}

export default function EditableExecutiveMemoPreview({
  content,
  onChange,
  documentLabel,
}: Props) {
  function patch<K extends keyof UseCase>(key: K, value: UseCase[K]) {
    onChange({ ...content, [key]: value });
  }

  // Memo split: first narrative section = Background, the rest = Analysis.
  // We compute on demand rather than splitting state so editing either
  // section reassembles a single narrativeSections array.
  const background: NarrativeSection =
    content.narrativeSections[0] ?? { heading: "Background", body: "" };
  const analysis: NarrativeSection[] = content.narrativeSections.slice(1);

  function updateBackground(next: NarrativeSection) {
    const rest = content.narrativeSections.slice(1);
    patch("narrativeSections", [next, ...rest]);
  }

  function updateAnalysis(next: NarrativeSection[]) {
    const first = content.narrativeSections[0];
    patch("narrativeSections", first ? [first, ...next] : next);
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
          placeholder="Memo title"
          className="mt-2 w-full border-0 bg-transparent p-0 text-2xl font-bold leading-tight tracking-tight text-slate-900 outline-none placeholder:text-slate-300 focus:ring-0"
        />
      </header>

      <div className="space-y-8 px-8 py-7">
        <ExpansionNotesPanel notes={content.expansionNotes} />

        <section>
          <SectionEyebrow>Executive summary</SectionEyebrow>
          <textarea
            value={content.executiveSummary}
            onChange={(e) => patch("executiveSummary", e.target.value)}
            rows={5}
            placeholder="A short, decision-oriented summary for the reader."
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-inner outline-none transition-colors focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </section>

        <section>
          <SectionEyebrow>Recommendation</SectionEyebrow>
          <textarea
            value={content.callToAction ?? ""}
            onChange={(e) => patch("callToAction", e.target.value || null)}
            rows={3}
            placeholder="What is the recommendation or decision being made?"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-inner outline-none transition-colors focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </section>

        <section>
          <SectionEyebrow>Key points</SectionEyebrow>
          <div className="mt-3">
            <EditableBulletList
              title="Key points"
              accentClass="border-t-slate-800"
              items={content.solutions}
              onChange={(v) => patch("solutions", v)}
              placeholder="A key point supporting the recommendation…"
            />
          </div>
        </section>

        <section>
          <SectionEyebrow>Background</SectionEyebrow>
          <p className="mt-1 text-xs text-slate-500">
            Context the reader needs before the analysis.
          </p>
          <div className="mt-3">
            <EditableSection
              section={background}
              onChange={updateBackground}
              headingPlaceholder="Background heading"
              bodyPlaceholder="Background context the reader needs."
            />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-2">
            <SectionEyebrow>Analysis</SectionEyebrow>
            <button
              type="button"
              onClick={() =>
                updateAnalysis([...analysis, { heading: "New Section", body: "" }])
              }
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              + Add section
            </button>
          </div>
          {analysis.length === 0 ? (
            <p className="mt-2 text-sm italic text-slate-400">
              No analysis sections. Click "+ Add section" to add one.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {analysis.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1">
                    <EditableSection
                      section={s}
                      onChange={(next) => {
                        const list = analysis.slice();
                        list[i] = next;
                        updateAnalysis(list);
                      }}
                      headingPlaceholder="Section heading"
                      bodyPlaceholder="Analysis body."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateAnalysis(analysis.filter((_, idx) => idx !== i))
                    }
                    aria-label="Remove analysis section"
                    className="mt-2 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionEyebrow>Risks / considerations</SectionEyebrow>
          <div className="mt-3">
            <EditableBulletList
              title="Risks"
              accentClass="border-t-amber-500"
              items={content.challenges}
              onChange={(v) => patch("challenges", v)}
              placeholder="A risk, dependency, or consideration…"
            />
          </div>
        </section>

        <section>
          <SectionEyebrow>Next steps</SectionEyebrow>
          <div className="mt-3">
            <EditableBulletList
              title="Next steps"
              accentClass="border-t-cyan-500"
              items={content.results}
              onChange={(v) => patch("results", v)}
              placeholder="A concrete next step…"
            />
          </div>
        </section>
      </div>
    </article>
  );
}
