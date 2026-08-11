interface Props {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, onRetry, onDismiss }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[7px] border border-alert-line bg-alert-tint px-4 py-3 text-sm text-alert-ink">
      <div>
        <div className="font-semibold">Something went wrong</div>
        <div>{message}</div>
      </div>
      <div className="flex shrink-0 gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-[6px] border border-alert-line bg-white px-3 py-1 text-xs font-semibold text-alert-ink hover:bg-alert-tint"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-[6px] px-2 py-1 text-xs text-alert-ink hover:bg-alert-tint"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
