export default function ExpansionNotesPanel({ notes }: { notes: string[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <section className="rounded-[9px] border border-review-line bg-review-tint p-4 text-sm text-review-ink">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-review-ink">
        AI Expansion Notes
      </h3>
      <ul className="list-disc space-y-1 pl-5">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </section>
  );
}
