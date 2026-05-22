export default function MissingFieldBadge({ field }: { field: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      Missing: {field}
    </span>
  );
}
