export default function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col">
      <div>
        <div className="h-8 w-2/3 animate-pulse rounded-[7px] bg-shell-canvas" />
        <div className="mt-4 h-4 w-1/3 animate-pulse rounded-[6px] bg-[#f1f1ee]" />
      </div>
      <div className="mt-10 border-t border-hair pt-10">
        <div className="h-4 w-1/4 animate-pulse rounded-[6px] bg-shell-canvas" />
        <div className="mt-4 h-4 w-full animate-pulse rounded-[6px] bg-[#f1f1ee]" />
        <div className="mt-2.5 h-4 w-5/6 animate-pulse rounded-[6px] bg-[#f1f1ee]" />
        <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded-[6px] bg-[#f1f1ee]" />
      </div>
      <div className="mt-8 flex items-center gap-2 text-[13px] text-ink-faint">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember-400" />
        {label}
      </div>
    </div>
  );
}
