import {
  DECISION_LABELS,
  formatTime,
  GATE_LABELS,
  type ApprovalRecord,
} from "../../lib/runTypes";
import { Collapsible, Hash, MetaGrid } from "./ui";

const TONE = { approve: "t-ready", request_changes: "t-review", reject: "t-draft" } as const;

export default function ApprovalHistory({ approvals }: { approvals: ApprovalRecord[] }) {
  const ordered = [...approvals].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));

  return (
    <section className="panel-card">
      <div className="panel-head">
        <h4>Approval history</h4>
        <span>Most recent first</span>
      </div>
      <div className="panel-body">
        {ordered.length === 0 ? (
          <p className="text-[9px] text-ink-mute">No decisions recorded yet.</p>
        ) : (
          ordered.map((record) => (
            <div key={record.id} className="task-line">
              <span className={`status-pill ${TONE[record.decision]} !p-0 !border-0 !bg-transparent`}>
                <span className="sr-only">{DECISION_LABELS[record.decision]}</span>
              </span>
              <span className="min-w-0">
                <strong>
                  {DECISION_LABELS[record.decision]} · {GATE_LABELS[record.gate]}
                </strong>
                <p>
                  {record.reviewerName}
                  {record.note && <> — “{record.note}”</>}
                </p>
                <Collapsible summary="Signed metadata">
                  <MetaGrid>
                    <Hash value={record.contentFingerprint} label="Content fingerprint" />
                    <Hash value={record.artifactSha256} label="Artifact SHA-256" />
                  </MetaGrid>
                </Collapsible>
              </span>
              <time>{formatTime(record.decidedAt)}</time>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
