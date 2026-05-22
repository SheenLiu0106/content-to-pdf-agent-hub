import { CONTENT_TYPE_LABELS, type ContentType } from "@shared/schema";

const TYPE_COLORS: Record<ContentType, string> = {
  general_article: "bg-slate-100 text-slate-800",
  newsletter: "bg-sky-100 text-sky-800",
  case_study: "bg-emerald-100 text-emerald-800",
  project_summary: "bg-violet-100 text-violet-800",
  executive_memo: "bg-indigo-100 text-indigo-800",
  marketing_brief: "bg-pink-100 text-pink-800",
  proposal_draft: "bg-amber-100 text-amber-800",
  meeting_summary: "bg-teal-100 text-teal-800",
};

export default function ContentTypeTag({ type }: { type: ContentType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${TYPE_COLORS[type]}`}
    >
      {CONTENT_TYPE_LABELS[type]}
    </span>
  );
}
