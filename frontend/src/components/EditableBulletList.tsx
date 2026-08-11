interface Props {
  title: string;
  /**
   * A document brand accent variable (see --doc-* in styles/workspace.css), NOT an
   * application theme colour. These mirror the PDF template's section accents.
   */
  accentVar?: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

const DEFAULT_ACCENT = "--doc-goals";

export default function EditableBulletList({
  title,
  accentVar = DEFAULT_ACCENT,
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
    <section
      style={{ borderTopColor: `var(${accentVar})` }}
      className="rounded-[7px] border border-hair border-t-2 bg-white p-3.5 shadow-row"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{title}</h3>
        <button
          type="button"
          onClick={addItem}
          className="rounded-[6px] border border-hair-strong bg-white px-2 py-0.5 text-xs font-medium text-ink-soft hover:bg-shell-pane"
        >
          + Add
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs italic text-ink-faint">No items. Click "+ Add" to insert one.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ink-faint" />
              <textarea
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                placeholder={placeholder}
                rows={Math.max(1, Math.ceil(item.length / 80))}
                className="min-h-[32px] flex-1 resize-none rounded-[6px] border border-hair bg-white px-2 py-1 text-sm text-ink outline-none focus:border-ember-400 focus:ring-2 focus:ring-ember-500/20"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label="Remove item"
                className="mt-1 rounded p-1 text-ink-faint hover:bg-alert-tint hover:text-alert-ink"
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
