import { useEffect } from "react";

interface Props {
  title: string;
  description?: string;
  onDismiss: () => void;
  durationMs?: number;
}

export default function Toast({ title, description, onDismiss, durationMs = 4000 }: Props) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(id);
  }, [onDismiss, durationMs]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-start gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 shadow-lg ring-1 ring-emerald-100"
      >
        <span
          aria-hidden
          className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white"
        >
          ✓
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {description && <p className="mt-0.5 text-xs text-slate-600">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ×
        </button>
      </div>
    </div>
  );
}
