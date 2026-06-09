interface Props {
  onGenerate: () => void;
  loading: boolean;
  disabled?: boolean;
}

export default function GeneratePdfButton({ onGenerate, loading, disabled = false }: Props) {
  return (
    <button
      type="button"
      onClick={onGenerate}
      disabled={loading || disabled}
      className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 py-3 pl-6 pr-2.5 text-sm font-semibold text-white shadow-soft-sm transition-all duration-300 ease-out hover:-translate-y-px hover:shadow-soft active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none disabled:hover:translate-y-0"
    >
      <span className="pointer-events-none">
        {loading ? "Generating PDF…" : "Generate PDF"}
      </span>
      <span className="absolute right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-transform duration-500 ease-spring group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105 group-disabled:bg-white/15">
        {loading ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-4 w-4 animate-spin"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="2"
              className="opacity-25"
            />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M12 4v12m0 0 4-4m-4 4-4-4M5 20h14" />
          </svg>
        )}
      </span>
    </button>
  );
}
