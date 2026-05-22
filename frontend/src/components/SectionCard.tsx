import type { ReactNode } from "react";
import MissingFieldBadge from "./MissingFieldBadge";

interface Props {
  title: string;
  field?: string;
  missing?: boolean;
  children?: ReactNode;
}

export default function SectionCard({ title, field, missing, children }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {missing && field && <MissingFieldBadge field={field} />}
      </div>
      <div className="text-sm leading-relaxed text-slate-800">
        {missing ? (
          <span className="italic text-slate-400">Not present in source.</span>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
