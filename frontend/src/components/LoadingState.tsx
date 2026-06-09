export default function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col">
      <div>
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="mt-4 h-4 w-1/3 animate-pulse rounded-md bg-slate-100" />
      </div>
      <div className="mt-10 border-t border-slate-200/70 pt-10">
        <div className="h-4 w-1/4 animate-pulse rounded-md bg-slate-200/80" />
        <div className="mt-4 h-4 w-full animate-pulse rounded-md bg-slate-100" />
        <div className="mt-2.5 h-4 w-5/6 animate-pulse rounded-md bg-slate-100" />
        <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded-md bg-slate-100" />
      </div>
      <div className="mt-8 flex items-center gap-2 text-[13px] text-slate-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
        {label}
      </div>
    </div>
  );
}
