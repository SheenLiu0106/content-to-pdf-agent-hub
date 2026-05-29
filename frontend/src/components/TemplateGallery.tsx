import { TEMPLATE_DEFINITIONS, type TemplateId } from "../lib/templates";

interface Props {
  selectedId: TemplateId;
  recommendedId: TemplateId | null;
  onSelect: (id: TemplateId) => void;
}

export default function TemplateGallery({
  selectedId,
  recommendedId,
  onSelect,
}: Props) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100/60">
      <h3 className="text-sm font-semibold text-slate-900">Template</h3>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        Choose how this content should be presented.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {TEMPLATE_DEFINITIONS.map((t) => {
          const isSelected = t.id === selectedId;
          const isRecommended = t.id === recommendedId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={isSelected}
              className={`group flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? "border-indigo-300 bg-indigo-50/70 ring-1 ring-indigo-200"
                  : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`truncate text-sm font-semibold ${
                    isSelected ? "text-indigo-900" : "text-slate-900"
                  }`}
                >
                  {t.label}
                </p>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {isRecommended && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                      Recommended
                    </span>
                  )}
                  {isSelected && (
                    <span className="inline-flex items-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                      Selected
                    </span>
                  )}
                </div>
              </div>
              <p
                className={`text-[11px] leading-snug ${
                  isSelected ? "text-indigo-700/80" : "text-slate-500"
                }`}
              >
                {t.description}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
