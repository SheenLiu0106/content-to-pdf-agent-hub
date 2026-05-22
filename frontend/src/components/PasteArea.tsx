interface Props {
  value: string;
  onChange: (v: string) => void;
  onExtract: () => void;
  loading: boolean;
}

const MIN = 20;
const MAX = 50_000;

export default function PasteArea({ value, onChange, onExtract, loading }: Props) {
  const length = value.length;
  const tooShort = length < MIN;
  const tooLong = length > MAX;
  const canExtract = !tooShort && !tooLong && !loading;

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-slate-700">
        Paste any content — article, memo, newsletter, meeting notes…
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste here. The AI will identify the content type and extract structure automatically."
        className="min-h-[260px] w-full resize-y rounded-lg border border-slate-300 bg-white p-4 font-sans text-sm leading-relaxed text-slate-800 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        disabled={loading}
      />
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {length.toLocaleString()} / {MAX.toLocaleString()} chars
          {tooShort && length > 0 && <span className="ml-2 text-amber-600">need at least {MIN}</span>}
          {tooLong && <span className="ml-2 text-red-600">too long — split into smaller chunks</span>}
        </span>
        <button
          type="button"
          onClick={onExtract}
          disabled={!canExtract}
          title={tooShort ? "Paste content to continue" : tooLong ? "Content too long" : "Extract structure with AI"}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Extracting…" : "Extract"}
        </button>
      </div>
    </div>
  );
}
