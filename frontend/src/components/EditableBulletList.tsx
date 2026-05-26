interface Props {
  title: string;
  accentClass?: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

const DEFAULT_ACCENT = "border-t-cyan-500";

export default function EditableBulletList({
  title,
  accentClass = DEFAULT_ACCENT,
  items,
  onChange,
  placeholder,
}: Props) {
  function updateItem(i: number, value: string) {
    const next = items.slice();
    next[i] = value;
    onChange(next);
  }

  function removeItem(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  function addItem() {
    onChange([...items, ""]);
  }

  return (
    <section className={`rounded-lg border border-slate-200 border-t-2 ${accentClass} bg-white p-4 shadow-sm`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <button
          type="button"
          onClick={addItem}
          className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          + Add
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs italic text-slate-400">No items. Click "+ Add" to insert one.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
              <textarea
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                placeholder={placeholder}
                rows={Math.max(1, Math.ceil(item.length / 80))}
                className="min-h-[32px] flex-1 resize-none rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label="Remove item"
                className="mt-1 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
