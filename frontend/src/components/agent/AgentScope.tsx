import {
  APPROVAL_MODE_LABELS,
  REVIEW_POLICY_LABELS,
  type ApprovalMode,
  type ReviewPolicy,
} from "../../lib/runTypes";

interface Props {
  /** The run's real policy — never a default written into the copy. */
  reviewPolicy: ReviewPolicy;
  approvalMode: ApprovalMode;
  /**
   * 'durable' is the production-run path with review and approval gates. 'single' is
   * the one-document path, which creates no run and no gates.
   */
  flow?: "durable" | "single";
  /** 'compact' drops the after-submission row for the side panes. */
  variant?: "full" | "compact";
  /** 'is-intake' renders the box at Create's reading size. */
  className?: string;
}

/**
 * What the agent is allowed to do, before it does any of it.
 *
 * Every line is derived from the configured reviewPolicy / approvalMode and from
 * behaviour that exists in this codebase (normalization, repair, the gate guards).
 * There is no aspirational AI copy here — if the product cannot do it, it is not
 * claimed, and the one thing the product cannot do (auto-approve) is stated as such.
 */
export default function AgentScope({
  reviewPolicy,
  approvalMode,
  flow = "durable",
  variant = "full",
  className = "",
}: Props) {
  const stops =
    flow === "single"
      ? "After extraction. The draft is handed to you before any PDF exists — nothing is rendered until you ask for it."
      : reviewPolicy === "always"
        ? "Always at the review gate, before any PDF is rendered — this run is configured to stop every time."
        : "At the review gate whenever a blocking finding is open. With no blocking finding it renders straight through to the final gate.";

  const humanOnly =
    approvalMode === "required"
      ? "Signing the rendered PDF. Waiving a blocking finding, requesting changes and rejecting a run are human-only too."
      : "Signing the rendered PDF: auto-approval is configured but disabled until rendered-output QA ships, so a human still signs every artifact. Waiving, requesting changes and rejecting are human-only.";

  const after =
    flow === "single"
      ? "The agent extracts a draft and opens it for editing on the next screen. No durable run, no gates, no reviewer sign-off."
      : "Each file becomes a durable run: queued, extracted, then waiting for you at the review gate. You can pause a run between stages, and every stage, decision and error is recorded in its event history.";

  return (
    <section className={`scope-box ${className}`} aria-label="Agent scope">
      <strong>Agent scope</strong>
      <dl className="scope-list">
        <div>
          <dt>What it does</dt>
          <dd>
            Reads your source, assesses it, picks a template, extracts the fields that
            template needs, then renders the PDF.
          </dd>
        </div>
        <div>
          <dt>What it may change on its own</dt>
          <dd>
            Wording, ordering and bullet counts, to fit the template's structure. It may
            add content beyond your source — each addition is recorded as a source
            expansion for you to review. It may also repair and re-render a failed
            layout. It never edits your source: extraction always replays from the
            stored original.
          </dd>
        </div>
        <div>
          <dt>When it stops</dt>
          <dd>{stops}</dd>
        </div>
        <div>
          <dt>Always needs a human</dt>
          <dd>{humanOnly}</dd>
        </div>
        {variant === "full" && (
          <div>
            <dt>After you submit</dt>
            <dd>{after}</dd>
          </div>
        )}
      </dl>
      <p className="scope-foot">
        {REVIEW_POLICY_LABELS[reviewPolicy]} · {APPROVAL_MODE_LABELS[approvalMode]}
        {approvalMode === "auto_if_clean" ? " (unavailable)" : ""}
      </p>
    </section>
  );
}
