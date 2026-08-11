import { ORIGIN_BASIS, ORIGIN_LABELS, type OriginKind } from "../../lib/agentUx";

interface Props {
  kind: OriginKind;
  /** Appended as "×N" when one badge stands for several items. */
  count?: number;
}

/**
 * A restrained provenance label.
 *
 * Only used where a real signal backs it, and never as a wash of colour over the
 * document — the badge sits beside the content it describes. `Source-backed` is
 * reserved for the stored raw source: this codebase has a source_expansion signal, not
 * a claim-grounding detector, so no extracted sentence is ever labelled as grounded.
 */
export default function ContentOriginBadge({ kind, count }: Props) {
  return (
    <span className={`origin-tag is-${kind}`} title={ORIGIN_BASIS[kind]}>
      <span aria-hidden="true" className="origin-dot" />
      {ORIGIN_LABELS[kind]}
      {count !== undefined && count > 1 && <span className="origin-count">×{count}</span>}
    </span>
  );
}
