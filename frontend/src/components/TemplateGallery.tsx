import { useState } from "react";
import { TEMPLATE_GALLERY } from "../lib/templates";

interface Props {
  activeId: string;
}

export default function TemplateGallery({ activeId }: Props) {
  const [showOthers, setShowOthers] = useState(false);
  const active = TEMPLATE_GALLERY.find((t) => t.id === activeId && t.available);
  const others = TEMPLATE_GALLERY.filter((t) => !t.available);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100/60">
      <h3 className="text-sm font-semibold text-slate-900">Template</h3>

      {active && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-indigo-900">
              {active.label}
            </p>
            <span className="inline-flex flex-shrink-0 items-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
              Active
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-indigo-700/80">
            {active.description}
          </p>
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            aria-expanded={showOthers}
            className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
          >
            <span>More templates</span>
            <span
              aria-hidden
              className={`text-slate-400 transition-transform ${showOthers ? "rotate-90" : ""}`}
            >
              ›
            </span>
          </button>
          {showOthers && (
            <ul className="mt-1 space-y-0.5">
              {others.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-slate-500"
                  aria-disabled
                >
                  <span className="truncate">{t.label}</span>
                  <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                    Soon
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
