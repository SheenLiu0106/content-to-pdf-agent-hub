// Gate decisions and edits. Deliberately free of ./config and of Fastify, so the
// transactional behaviour can be tested directly; the route is a thin HTTP mapping
// over applyAction().
//
// Every handler here assumes it is running INSIDE the caller's immediate
// transaction, and re-reads state rather than trusting the request.

import { existsSync, readFileSync } from "node:fs";

import {
  canApproveFinal,
  canApproveReviewGate,
  deriveIssues,
  isActionAllowed,
  retryTarget,
  type GuardResult,
} from "./machine.js";
import { fingerprint, sha256Hex, type RunStore } from "./store.js";
import type { Run, RunAction } from "./types.js";

export type ActionOutcome =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "guard"; guard: GuardResult }
  | { kind: "not_found"; message: string };

/** Live fingerprint of what is currently stored — never taken from the request. */
export function currentFingerprintOf(run: Run): string {
  return fingerprint(run.content, run.config);
}

/**
 * sha256 of the artifact actually on disk, or null when missing/unreadable.
 * Injectable so tests can simulate a corrupted or deleted file.
 */
export type ArtifactHasher = (run: Run) => string | null;

export const hashArtifactOnDisk: ArtifactHasher = (run) => {
  if (!run.pdfPath || !existsSync(run.pdfPath)) return null;
  try {
    return sha256Hex(readFileSync(run.pdfPath));
  } catch {
    return null;
  }
};

function reconcile(store: RunStore, run: Run, actor: string): void {
  if (!run.content) return;
  store.syncIssues(
    run.id,
    deriveIssues({
      content: run.content,
      config: run.config,
      intakeRisks: run.agent?.intake.risks,
    }),
    actor
  );
}

function setStatus(store: RunStore, runId: string, status: string): void {
  store.db
    .prepare(`UPDATE runs SET status = ?, updated_at = ? WHERE id = ?`)
    .run(status, new Date().toISOString(), runId);
}

export interface ApplyActionDeps {
  store: RunStore;
  hashArtifact?: ArtifactHasher;
}

/**
 * Validate and apply one action. Must be invoked inside a
 * `store.db.transaction(...).immediate()` so validation, the audit insert, the
 * event insert and the status update commit or roll back together.
 */
export function applyAction(
  deps: ApplyActionDeps,
  runId: string,
  action: RunAction
): ActionOutcome {
  const { store } = deps;
  const hashArtifact = deps.hashArtifact ?? hashArtifactOnDisk;

  const run = store.getRun(runId);
  if (!run) return { kind: "not_found", message: "No such run." };

  const permitted = isActionAllowed(action, run);
  if (!permitted.ok) return { kind: "guard", guard: permitted };

  switch (action.action) {
    case "pause":
      store.setPaused(run.id, true, "user");
      return { kind: "ok", body: { paused: true } };

    case "resume":
      store.setPaused(run.id, false, "user");
      return { kind: "ok", body: { paused: false } };

    case "update_content": {
      store.db
        .prepare(`UPDATE runs SET content_json = ?, updated_at = ? WHERE id = ?`)
        .run(JSON.stringify(action.content), new Date().toISOString(), run.id);
      // Same transaction as the write, so a following gate decision cannot see a
      // stale issue set.
      reconcile(store, { ...run, content: action.content }, "user");
      return { kind: "ok", body: { updated: "content" } };
    }

    case "update_config": {
      store.db
        .prepare(`UPDATE runs SET config_json = ?, updated_at = ? WHERE id = ?`)
        .run(JSON.stringify(action.config), new Date().toISOString(), run.id);
      reconcile(store, { ...run, config: action.config }, "user");
      return { kind: "ok", body: { updated: "config" } };
    }

    case "waive_issue": {
      const issue = store.getIssue(action.issueId);
      if (!issue || issue.runId !== run.id) {
        return { kind: "not_found", message: "No such issue on this run." };
      }
      const waived = store.waiveIssue({
        issueId: action.issueId,
        expectedFindingFingerprint: action.expectedFindingFingerprint,
        reviewerName: action.reviewerName,
        note: action.note,
      });
      if (!waived) {
        return {
          kind: "guard",
          guard: {
            ok: false,
            code: "fingerprint_mismatch",
            message:
              "This finding changed since you loaded it. Reload and review the current finding.",
            detail: { currentFindingFingerprint: issue.findingFingerprint },
          },
        };
      }
      store.appendEvent({
        runId: run.id,
        type: "issue_waived",
        actor: `user:${action.reviewerName}`,
        detail: { issueId: action.issueId, note: action.note },
      });
      return { kind: "ok", body: { waived: action.issueId } };
    }

    case "approve_gate": {
      if (action.gate === "review") {
        const currentFingerprint = currentFingerprintOf(run);
        const guard = canApproveReviewGate({
          run,
          openBlocking: store.countOpenBlocking(run.id),
          currentFingerprint,
          expectedFingerprint: action.expectedFingerprint,
        });
        if (!guard.ok) return { kind: "guard", guard };

        store.insertApproval({
          runId: run.id,
          gate: "review",
          decision: "approve",
          reviewerName: action.reviewerName,
          note: action.note ?? null,
          contentFingerprint: currentFingerprint,
          // No active artifact exists at the review gate.
          artifactSha256: null,
        });
        store.appendEvent({
          runId: run.id,
          type: "decision",
          actor: `user:${action.reviewerName}`,
          fromStatus: "REVIEW",
          toStatus: "READY_TO_RENDER",
          detail: { gate: "review", decision: "approve" },
        });
        setStatus(store, run.id, "READY_TO_RENDER");
        return { kind: "ok", body: { approved: "review" } };
      }

      const currentFingerprint = currentFingerprintOf(run);
      const guard = canApproveFinal({
        run,
        openBlocking: store.countOpenBlocking(run.id),
        currentFingerprint,
        expectedFingerprint: action.expectedFingerprint,
        expectedArtifactSha256: action.expectedArtifactSha256 ?? "",
        // Re-hashed inside the transaction: existsSync alone would let a
        // corrupted or swapped file be signed.
        artifactOnDiskSha256: hashArtifact(run),
      });
      if (!guard.ok) return { kind: "guard", guard };

      store.insertApproval({
        runId: run.id,
        gate: "approval",
        decision: "approve",
        reviewerName: action.reviewerName,
        note: action.note ?? null,
        contentFingerprint: currentFingerprint,
        artifactSha256: run.artifactSha256,
      });
      store.appendEvent({
        runId: run.id,
        type: "decision",
        actor: `user:${action.reviewerName}`,
        fromStatus: "APPROVAL",
        toStatus: "APPROVED",
        detail: {
          gate: "approval",
          decision: "approve",
          artifactSha256: run.artifactSha256,
          contentFingerprint: currentFingerprint,
        },
      });
      setStatus(store, run.id, "APPROVED");
      return {
        kind: "ok",
        body: { approved: "final", artifactSha256: run.artifactSha256 },
      };
    }

    case "request_changes": {
      // Capture BEFORE invalidation, or the audit trail loses which artifact was
      // sent back.
      const contentFingerprint = currentFingerprintOf(run);
      const artifactSha256 = run.artifactSha256;

      store.insertApproval({
        runId: run.id,
        gate: "approval",
        decision: "request_changes",
        reviewerName: action.reviewerName,
        note: action.note,
        contentFingerprint,
        artifactSha256,
      });
      store.appendEvent({
        runId: run.id,
        type: "decision",
        actor: `user:${action.reviewerName}`,
        fromStatus: "APPROVAL",
        toStatus: "REVIEW",
        detail: {
          gate: "approval",
          decision: "request_changes",
          invalidatedArtifactSha256: artifactSha256,
        },
      });

      // The immutable file stays on disk as audit evidence; it is simply no
      // longer this run's active artifact.
      store.db
        .prepare(
          `UPDATE runs
              SET status = 'REVIEW',
                  pdf_path = NULL,
                  artifact_sha256 = NULL,
                  rendered_fingerprint = NULL,
                  qa_json = NULL,
                  updated_at = ?
            WHERE id = ?`
        )
        .run(new Date().toISOString(), run.id);

      return {
        kind: "ok",
        body: { requestedChanges: true, invalidatedArtifactSha256: artifactSha256 },
      };
    }

    case "reject": {
      const atApproval = run.status === "APPROVAL";
      const contentFingerprint = currentFingerprintOf(run);
      store.insertApproval({
        runId: run.id,
        gate: atApproval ? "approval" : "review",
        decision: "reject",
        reviewerName: action.reviewerName,
        note: action.note,
        contentFingerprint,
        // At APPROVAL, record exactly which artifact was rejected.
        artifactSha256: atApproval ? run.artifactSha256 : null,
      });
      store.appendEvent({
        runId: run.id,
        type: "decision",
        actor: `user:${action.reviewerName}`,
        fromStatus: run.status,
        toStatus: "REJECTED",
        detail: {
          decision: "reject",
          artifactSha256: atApproval ? run.artifactSha256 : null,
        },
      });
      setStatus(store, run.id, "REJECTED");
      return { kind: "ok", body: { rejected: true } };
    }

    case "retry": {
      // Resume the stage that failed. A render retry must never re-run
      // extraction, which would overwrite human-edited content.
      const target = retryTarget(run.lastErrorStage);
      const resetExtract = target === "QUEUED";

      store.db
        .prepare(
          `UPDATE runs
              SET status = @target,
                  extract_attempts = CASE WHEN @resetExtract THEN 0 ELSE extract_attempts END,
                  render_attempts  = CASE WHEN @resetExtract THEN render_attempts ELSE 0 END,
                  next_attempt_at = NULL,
                  last_error = NULL,
                  last_error_stage = NULL,
                  updated_at = @now
            WHERE id = @id`
        )
        .run({
          id: run.id,
          target,
          resetExtract: resetExtract ? 1 : 0,
          now: new Date().toISOString(),
        });

      store.appendEvent({
        runId: run.id,
        type: "transition",
        actor: "user",
        fromStatus: "FAILED",
        toStatus: target,
        detail: { reason: "manual_retry", stage: run.lastErrorStage },
      });

      return { kind: "ok", body: { retryingAt: target } };
    }
  }
}
