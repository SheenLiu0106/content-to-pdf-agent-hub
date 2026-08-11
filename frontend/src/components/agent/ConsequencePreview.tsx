interface Props {
  items: readonly string[];
  /** Default states the shared idea: this is what submitting does. */
  title?: string;
  tone?: "neutral" | "warning";
}

/**
 * What submitting will actually do, before it is done.
 *
 * Plain consequences only — scope of a waiver, what an approval signs, what a retry
 * resumes. Fingerprints and artifact hashes are never the explanation; they stay in
 * the collapsed technical detail where they belong.
 */
export default function ConsequencePreview({
  items,
  title = "What this does",
  tone = "neutral",
}: Props) {
  if (items.length === 0) return null;
  return (
    <div className={`consequence-box${tone === "warning" ? " is-warn" : ""}`}>
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
