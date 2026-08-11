import { QA_VERDICT_LABELS, type QaReport } from "../../lib/runTypes";

const TONE = { pass: "", warn: "is-warn", fail: "is-bad" } as const;

export default function QaSummary({ qa }: { qa: QaReport | null }) {
  return (
    <section className="panel-card">
      <div className="panel-head">
        <h4>QA report</h4>
        <span>{qa ? QA_VERDICT_LABELS[qa.verdict] : "Not run"}</span>
      </div>
      <div className="panel-body">
        <p className="mb-2 text-[8.5px] leading-relaxed text-ink-mute">
          Pre-render checks only. Rendered-output QA is not implemented yet, which is why
          every run still needs a human at the final gate.
        </p>
        {!qa ? (
          <p className="text-[9px] text-ink-mute">
            No QA report yet — it is produced by the render stage.
          </p>
        ) : (
          qa.checks.map((check, i) => (
            <div key={`${check.code}-${i}`} className="check-row">
              <span>
                <i className={`check-icon ${TONE[check.verdict]}`} aria-hidden="true">
                  {check.verdict === "pass" ? "✓" : check.verdict === "warn" ? "!" : "✕"}
                </i>
                <span className="min-w-0">
                  <span className="block leading-snug">{check.message}</span>
                  <code className="text-[7.5px] text-ink-faint">
                    {check.stage === "pre_render" ? "pre-render" : "render"} · {check.code}
                  </code>
                </span>
              </span>
              <strong>{QA_VERDICT_LABELS[check.verdict]}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
