export type StepId = "paste" | "extract" | "edit" | "brand" | "generate";

interface Props {
  current: StepId;
  completed: ReadonlySet<StepId>;
  substages?: string[];
}

const STEPS: { id: StepId; label: string }[] = [
  { id: "paste", label: "Paste" },
  { id: "extract", label: "Extract" },
  { id: "edit", label: "Edit" },
  { id: "brand", label: "Brand" },
  { id: "generate", label: "Generate" },
];

export default function StepBar({ current, completed, substages }: Props) {
  return (
    <nav aria-label="Workflow steps" className="w-full">
      <ol className="flex w-full items-center">
        {STEPS.map((step, idx) => {
          const isCompleted = completed.has(step.id);
          const isCurrent = current === step.id;
          const isLast = idx === STEPS.length - 1;

          // Restrained dots — a thin ring at rest, a filled accent dot when
          // active or done. No heavy circles, no boxed numbers.
          const dotClass = isCompleted
            ? "bg-indigo-500"
            : isCurrent
              ? "bg-indigo-500 ring-4 ring-indigo-500/15"
              : "bg-slate-300/70";

          const labelClass = isCurrent
            ? "text-slate-900"
            : isCompleted
              ? "text-slate-500"
              : "text-slate-400";

          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full transition-all duration-500 ease-spring ${dotClass}`}
                  aria-current={isCurrent ? "step" : undefined}
                />
                <span
                  className={`hidden text-[10px] font-medium uppercase tracking-[0.18em] transition-colors duration-500 ease-spring sm:inline ${labelClass}`}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`mx-3 h-px flex-1 origin-left transition-all duration-700 ease-spring ${
                    isCompleted ? "bg-indigo-300" : "bg-slate-200"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
      {substages && substages.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-indigo-500/90">
          {substages.map((s, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
              )}
              <span className="rounded-full bg-indigo-500/[0.07] px-2.5 py-1 font-semibold text-indigo-600">
                {s}
              </span>
            </span>
          ))}
        </div>
      )}
    </nav>
  );
}
