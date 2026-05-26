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
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste a customer story, case study draft, project recap, or any narrative content. The AI will identify the structure (goals, challenges, solutions, results) and prepare it for review."
        className="min-h-[320px] w-full resize-y rounded-lg border border-slate-300 bg-slate-50/50 p-4 font-sans text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        disabled={loading}
      />
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
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
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Extracting…" : "Extract content →"}
        </button>
      </div>
    </div>
  );
}
