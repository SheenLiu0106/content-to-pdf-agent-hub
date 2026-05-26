export type StepId = "paste" | "extract" | "edit" | "brand" | "generate";

interface Props {
  current: StepId;
  completed: ReadonlySet<StepId>;
}

const STEPS: { id: StepId; label: string }[] = [
  { id: "paste", label: "Paste" },
  { id: "extract", label: "Extract" },
  { id: "edit", label: "Edit" },
  { id: "brand", label: "Brand" },
  { id: "generate", label: "Generate" },
];

export default function StepBar({ current, completed }: Props) {
  return (
    <nav aria-label="Workflow steps" className="w-full">
      <ol className="flex w-full items-center gap-1 sm:gap-1.5">
        {STEPS.map((step, idx) => {
          const isCompleted = completed.has(step.id);
          const isCurrent = current === step.id;
          const isLast = idx === STEPS.length - 1;

          const circleClass = isCompleted
            ? "bg-indigo-600 text-white ring-2 ring-indigo-100"
            : isCurrent
              ? "bg-white text-indigo-700 ring-2 ring-indigo-500 shadow-sm"
              : "bg-white text-slate-400 ring-1 ring-slate-200";

          const labelClass = isCurrent
            ? "font-semibold text-slate-900"
            : isCompleted
              ? "font-medium text-slate-700"
              : "font-medium text-slate-400";

          const connectorClass = isCompleted ? "bg-indigo-300" : "bg-slate-200";

          return (
            <li key={step.id} className="flex flex-1 items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${circleClass}`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? (
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3 w-3"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.07 7.146a1 1 0 0 1-1.42.006L3.29 8.95a1 1 0 1 1 1.42-1.408l3.215 3.244 6.36-6.43a1 1 0 0 1 1.42-.066Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className={`hidden text-[11px] uppercase tracking-wide sm:inline ${labelClass}`}>
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`h-px flex-1 ${connectorClass}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
