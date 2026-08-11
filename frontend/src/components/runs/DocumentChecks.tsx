import type * as api from "../../lib/api";

/**
 * Real checks only: the issue severities the backend recorded, the QA verdict, and
 * whether a human still has to sign. Nothing here is scored, weighted or predicted.
 *
 * The rows are grouped by who owns them, which is the distinction the whole product
 * turns on: the first four are system state, the last is a human decision.
 */
export default function DocumentChecks({ detail }: { detail: api.RunDetail }) {
  const { run } = detail;
  const open = detail.issues.filter((i) => i.status === "open");
  const blocking = open.filter((i) => i.severity === "blocking").length;
  const warnings = open.filter((i) => i.severity === "warning").length;
  const waived = detail.issues.filter((i) => i.status === "waived").length;

  const rows: { label: string; value: string; tone: "ok" | "warn" | "bad" }[] = [
    {
      label: "Blocking findings",
      value: blocking === 0 ? "None" : String(blocking),
      tone: blocking === 0 ? "ok" : "bad",
    },
    {
      label: "Warnings",
      value: warnings === 0 ? "None" : String(warnings),
      tone: warnings === 0 ? "ok" : "warn",
    },
    { label: "Waived by a reviewer", value: waived === 0 ? "None" : String(waived), tone: "ok" },
    {
      label: "Pre-render QA",
      value: run.qa ? run.qa.verdict.toUpperCase() : "Not run yet",
      tone: !run.qa
        ? "warn"
        : run.qa.verdict === "fail"
          ? "bad"
          : run.qa.verdict === "warn"
            ? "warn"
            : "ok",
    },
    {
      label: "Human sign-off",
      value: run.approvalMode === "required" ? "Required" : "Required (auto disabled)",
      tone: "warn",
    },
  ];

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h4>Document checks</h4>
        <span>Recorded by the agent</span>
      </div>
      <div className="panel-body">
        {rows.map((row) => (
          <div key={row.label} className="check-row">
            <span>
              <i
                className={`check-icon ${row.tone === "warn" ? "is-warn" : row.tone === "bad" ? "is-bad" : ""}`}
                aria-hidden="true"
              >
                {row.tone === "ok" ? "✓" : row.tone === "warn" ? "!" : "✕"}
              </i>
              {row.label}
            </span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
