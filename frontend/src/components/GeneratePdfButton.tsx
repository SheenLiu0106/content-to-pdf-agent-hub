interface Props {
  onGenerate: () => void;
  loading: boolean;
}

export default function GeneratePdfButton({ onGenerate, loading }: Props) {
  return (
    <button
      type="button"
      onClick={onGenerate}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {loading ? "Generating PDF…" : "Generate PDF"}
    </button>
  );
}
