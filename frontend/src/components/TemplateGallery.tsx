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
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Template
      </h3>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
        Choose how this content should be presented.
      </p>

      <div className="mt-4 flex flex-col gap-1">
        {TEMPLATE_DEFINITIONS.map((t) => {
          const isSelected = t.id === selectedId;
          const isRecommended = t.id === recommendedId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={isSelected}
              className={`group flex w-full flex-col gap-1 rounded-xl px-3.5 py-3 text-left ring-1 ring-inset transition-all duration-300 ease-out will-change-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] ${
                isSelected
                  ? "bg-indigo-50 shadow-soft-sm ring-indigo-300/70"
                  : "bg-white ring-slate-200/80 hover:shadow-soft-sm hover:ring-indigo-300/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`truncate text-sm font-semibold tracking-tight ${
                    isSelected ? "text-indigo-700" : "text-slate-800"
                  }`}
                >
                  {t.label}
                </p>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {isRecommended && (
                    <span className="inline-flex items-center rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-600">
                      Recommended
                    </span>
                  )}
                  {isSelected && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-white">
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-2.5 w-2.5"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.07 7.146a1 1 0 0 1-1.42.006L3.29 8.95a1 1 0 1 1 1.42-1.408l3.215 3.244 6.36-6.43a1 1 0 0 1 1.42-.066Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
              <p
                className={`text-[11px] leading-relaxed ${
                  isSelected ? "text-indigo-600/70" : "text-slate-400"
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
