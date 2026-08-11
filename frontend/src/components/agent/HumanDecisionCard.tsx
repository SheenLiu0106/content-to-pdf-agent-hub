import type { ReactNode } from "react";

import type { OriginKind } from "../../lib/agentUx";
import ContentOriginBadge from "./ContentOriginBadge";

export interface DecisionOption {
  /** What the reviewer can choose. */
  label: string;
  /** What happens if they choose it. */
  outcome: string;
  /** False when the action is not legal in this state — with the reason why. */
  available?: boolean;
  unavailableReason?: string;
}

interface Props {
  /** Real severity / status / source labels from the issue record. */
  severityLabel: string;
  statusLabel: string;
  sourceLabel: string;
  /** The finding's own message. */
  headline: string;
  /** Why the agent stopped, or why it is asking. */
  why: string;
  /** The affected content, in words, and its structural coordinate. */
  locatorLabel: string;
  locator: string;
  code: string;
  origin?: OriginKind;
  /** Anything else the backend recorded that helps the judgement. */
  evidence?: ReactNode;
  /** What can be decided and what follows from each choice. */
  options: DecisionOption[];
  /** Rendered when the finding already carries a human or automatic disposition. */
  resolution?: ReactNode;
  /** Hashes and raw payloads — never the primary explanation. */
  technical?: ReactNode;
  /** The controls themselves. */
  children?: ReactNode;
  prominent?: boolean;
}

/**
 * A blocking finding presented as the decision it actually is, not as an error row.
 *
 * The five things a reviewer needs are always present: why the agent stopped, which
 * content it concerns, the evidence behind it, what they can decide, and what each
 * decision leads to.
 */
export default function HumanDecisionCard({
  severityLabel,
  statusLabel,
  sourceLabel,
  headline,
  why,
  locatorLabel,
  locator,
  code,
  origin,
  evidence,
  options,
  resolution,
  technical,
  children,
  prominent = false,
}: Props) {
  return (
    <section className={prominent ? "decision-card" : "panel-card"}>
      <div className="panel-body">
        <div className="decision-top">
          <span aria-hidden="true">▲</span>
          <span>{severityLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{statusLabel}</span>
          <span className="ml-auto font-normal normal-case tracking-normal text-ink-mute">
            {sourceLabel}
          </span>
        </div>

        <h4>{headline}</h4>

        <p>
          <strong className="font-semibold text-ink-soft">Why the agent stopped:</strong> {why}
        </p>

        <p>
          <strong className="font-semibold text-ink-soft">Affected content:</strong>{" "}
          {locatorLabel}
          {origin && (
            <>
              {" "}
              <ContentOriginBadge kind={origin} />
            </>
          )}
        </p>

        <div className="evidence-pill flex flex-wrap items-center gap-1.5">
          <code className="text-[7.5px] font-bold uppercase tracking-wider">{code}</code>
          <span aria-hidden="true">·</span>
          <code title={locator}>{locator}</code>
        </div>

        {evidence}

        {options.length > 0 && (
          <dl className="decision-options">
            {options.map((option) => (
              <div key={option.label}>
                <dt>{option.label}</dt>
                <dd>
                  {option.outcome}
                  {option.available === false && option.unavailableReason && (
                    <em className="block not-italic text-ink-faint">
                      {option.unavailableReason}
                    </em>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {resolution}
        {technical}
        {children}
      </div>
    </section>
  );
}
