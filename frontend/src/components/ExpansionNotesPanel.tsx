export default function ExpansionNotesPanel({ notes }: { notes: string[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-700">
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
