import { useId, useState } from "react";

import ConsequencePreview from "../agent/ConsequencePreview";

interface Props {
  submitLabel: string;
  /** Text of the confirmation button — states the action, never just "OK". */
  confirmLabel: string;
  confirmPrompt: string;
  /**
   * What submitting actually does. Shown before the reviewer commits, not after — the
   * confirmation step restates the headline, this explains the effect.
   */
  consequences?: readonly string[];
  tone?: "primary" | "accent" | "danger";
  noteRequired: boolean;
  noteLabel?: string;
  notePlaceholder?: string;
  /** Lifted so the name survives switching runs and a 409 reload. */
  reviewerName: string;
  onReviewerNameChange: (next: string) => void;
  /** Set when the surrounding panel already renders one shared name field. */
  hideReviewerField?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  busy?: boolean;
  /** Resolves true on success, which clears the note. */
  onSubmit: (note: string) => Promise<boolean>;
}

const TONE = { primary: "btn dark", accent: "btn accent", danger: "btn danger" } as const;

/** Who is recording the decision. Rendered once per decision panel. */
export function ReviewerNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label className="field-label" htmlFor={`${id}-reviewer`}>
        Your name
      </label>
      <input
        id={`${id}-reviewer`}
        type="text"
        className="field-input"
        value={value}
        placeholder="Reviewer name"
        autoComplete="name"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * Reviewer name + note + confirmation, shared by every human decision. The note lives
 * in local state and is NOT reset by a parent re-render, so a 409 reload preserves
 * whatever the reviewer had typed.
 */
export default function DecisionForm({
  submitLabel,
  confirmLabel,
  confirmPrompt,
  consequences,
  tone = "primary",
  noteRequired,
  noteLabel = "Note",
  notePlaceholder,
  reviewerName,
  onReviewerNameChange,
  hideReviewerField = false,
  disabled = false,
  disabledReason,
  busy = false,
  onSubmit,
}: Props) {
  const ids = useId();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  function requestConfirm() {
    if (reviewerName.trim().length === 0) {
      setValidation("Enter your name before recording a decision.");
      return;
    }
    if (noteRequired && note.trim().length === 0) {
      setValidation("A reason is required for this decision.");
      return;
    }
    setValidation(null);
    setConfirming(true);
  }

  async function submit() {
    const ok = await onSubmit(note.trim());
    setConfirming(false);
    if (ok) setNote("");
  }

  return (
    <div className="flex flex-col gap-2.5">
      {!hideReviewerField && (
        <ReviewerNameField value={reviewerName} onChange={onReviewerNameChange} />
      )}

      {consequences && consequences.length > 0 && (
        <ConsequencePreview
          items={consequences}
          title={`Before you ${submitLabel.toLowerCase()}`}
          tone={tone === "danger" ? "warning" : "neutral"}
        />
      )}

      <div>
        <label className="field-label" htmlFor={`${ids}-note`}>
          {noteLabel}
          {noteRequired ? (
            <span aria-hidden="true" className="ml-1 text-ember-500">
              *
            </span>
          ) : (
            <span className="ml-1 font-normal text-ink-faint">(optional)</span>
          )}
        </label>
        <textarea
          id={`${ids}-note`}
          className="field-input"
          value={note}
          rows={3}
          required={noteRequired}
          placeholder={notePlaceholder}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {validation && (
        <p role="alert" className="text-[9px] font-semibold text-alert-ink">
          {validation}
        </p>
      )}

      {disabled && disabledReason && (
        <p className="text-[8.5px] leading-relaxed text-ink-mute">{disabledReason}</p>
      )}

      {confirming ? (
        <div
          role="group"
          aria-label={confirmLabel}
          className="rounded-[7px] border border-[rgba(242,107,58,0.2)] bg-[#fff4ec] px-2.5 py-2.5"
        >
          <p className="text-[9px] leading-relaxed text-[#98502f]">{confirmPrompt}</p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => void submit()} disabled={busy} className={TONE[tone]}>
              {busy ? "Submitting…" : confirmLabel}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="btn">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={requestConfirm}
          disabled={disabled || busy}
          className={`${TONE[tone]} full`}
        >
          {submitLabel}
        </button>
      )}
    </div>
  );
}
