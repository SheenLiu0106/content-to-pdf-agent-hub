export default function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-7 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-4 w-1/4 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="text-center text-sm text-slate-500">{label}</div>
    </div>
  );
}
