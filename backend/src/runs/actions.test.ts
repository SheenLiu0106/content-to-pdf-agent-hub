import assert from "node:assert/strict";
import test from "node:test";

import { applyAction, currentFingerprintOf } from "./actions.js";
import { TEST_AGENT, TEST_CONFIG, TEST_CONTENT } from "./fixtures.js";
import { deriveIssues } from "./machine.js";
import { RunStore, fingerprint } from "./store.js";
import type { ActionOutcome } from "./actions.js";
import type { Run, RunAction, RunStatus } from "./types.js";

const SHA = "sha-of-the-artifact";

function newStore(): RunStore {
  return new RunStore({ dbPath: ":memory:", artifactRoot: "/tmp/ctp-actions" });
}

function seedRun(store: RunStore, over: Partial<Run> = {}): Run {
  const { runs } = store.createBatch({
    reviewPolicy: "only_when_flagged",
    approvalMode: "required",
    items: [{ name: "doc.txt", rawContent: "x".repeat(40), config: TEST_CONFIG }],
  });
  const id = runs[0]!.id;

  store.db
    .prepare(`UPDATE runs SET content_json = ?, agent_json = ? WHERE id = ?`)
    .run(JSON.stringify(TEST_CONTENT), JSON.stringify(TEST_AGENT), id);

  if (over.status) {
    store.db.prepare(`UPDATE runs SET status = ? WHERE id = ?`).run(over.status, id);
  }
  if (over.qa !== undefined) {
    store.db
      .prepare(`UPDATE runs SET qa_json = ? WHERE id = ?`)
      .run(over.qa ? JSON.stringify(over.qa) : null, id);
  }
  if (over.lastErrorStage !== undefined) {
    store.db
      .prepare(`UPDATE runs SET last_error_stage = ? WHERE id = ?`)
      .run(over.lastErrorStage, id);
  }
  return store.getRun(id)!;
}

/** A run at APPROVAL with a coherent artifact, so guards can be exercised. */
function atApproval(store: RunStore, contentOverride?: typeof TEST_CONTENT): Run {
  const run = seedRun(store, { status: "APPROVAL" });
  const content = contentOverride ?? TEST_CONTENT;
  store.db
    .prepare(
      `UPDATE runs SET content_json = ?, pdf_path = ?, artifact_sha256 = ?,
                       rendered_fingerprint = ?, qa_json = ? WHERE id = ?`
    )
    .run(
      JSON.stringify(content),
      `/tmp/ctp-actions/${run.id}/${SHA}.pdf`,
      SHA,
      fingerprint(content, TEST_CONFIG),
      JSON.stringify({ verdict: "pass", checks: [] }),
      run.id
    );
  return store.getRun(run.id)!;
}

/** applyAction must run inside an immediate transaction, as the route does. */
function act(store: RunStore, runId: string, action: RunAction, sha: string | null = SHA) {
  return store.db
    .transaction((): ActionOutcome =>
      applyAction({ store, hashArtifact: () => sha }, runId, action)
    )
    .immediate();
}

// ---------------------------------------------------------------------------
// permissions
// ---------------------------------------------------------------------------

test("unknown run reports not_found", () => {
  const store = newStore();
  const out = act(store, "nope", { action: "pause" });
  assert.equal(out.kind, "not_found");
  store.close();
});

test("editing at APPROVAL is refused and points at request_changes", () => {
  const store = newStore();
  const run = atApproval(store);
  const out = act(store, run.id, { action: "update_content", content: TEST_CONTENT });
  assert.equal(out.kind, "guard");
  if (out.kind === "guard" && !out.guard.ok) {
    assert.equal(out.guard.code, "wrong_state");
    assert.match(out.guard.message, /request_changes/);
  }
  store.close();
});

test("editing while RENDERING is refused", () => {
  const store = newStore();
  const run = seedRun(store, { status: "RENDERING" });
  const out = act(store, run.id, { action: "update_config", config: TEST_CONFIG });
  assert.equal(out.kind, "guard");
  store.close();
});

// ---------------------------------------------------------------------------
// review gate
// ---------------------------------------------------------------------------

test("review approval succeeds and records an audit row with no artifact", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });

  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "review",
    reviewerName: "sheen",
    expectedFingerprint: currentFingerprintOf(run),
  });

  assert.equal(out.kind, "ok");
  assert.equal(store.getRun(run.id)!.status, "READY_TO_RENDER");

  const approvals = store.listApprovals(run.id);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0]!.gate, "review");
  assert.equal(approvals[0]!.decision, "approve");
  assert.equal(approvals[0]!.reviewerName, "sheen");
  assert.equal(approvals[0]!.artifactSha256, null);
  assert.ok(store.listEvents(run.id).some((e) => e.type === "decision"));
  store.close();
});

test("review approval is refused with a stale fingerprint and changes nothing", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });

  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "review",
    reviewerName: "sheen",
    expectedFingerprint: "stale-fingerprint",
  });

  assert.equal(out.kind, "guard");
  if (out.kind === "guard" && !out.guard.ok) {
    assert.equal(out.guard.code, "fingerprint_mismatch");
  }
  assert.equal(store.getRun(run.id)!.status, "REVIEW");
  assert.equal(store.listApprovals(run.id).length, 0, "no audit row on a refused decision");
  store.close();
});

test("review approval is refused while a blocking issue is open", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });

  // Off-contract content produces blocking render_validation issues.
  const broken = { ...TEST_CONTENT, solutions: ["only one"] };
  act(store, run.id, { action: "update_content", content: broken });
  assert.ok(store.countOpenBlocking(run.id) > 0);

  const current = store.getRun(run.id)!;
  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "review",
    reviewerName: "sheen",
    expectedFingerprint: currentFingerprintOf(current),
  });

  assert.equal(out.kind, "guard");
  if (out.kind === "guard" && !out.guard.ok) {
    assert.equal(out.guard.code, "blocking_issues_open");
  }
  assert.equal(store.getRun(run.id)!.status, "REVIEW");
  store.close();
});

test("fixing content auto-clears the issue and unblocks the gate", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });

  act(store, run.id, {
    action: "update_content",
    content: { ...TEST_CONTENT, solutions: ["one"] },
  });
  assert.ok(store.countOpenBlocking(run.id) > 0);

  // Restore a conforming draft: reconciliation stops seeing the finding.
  act(store, run.id, { action: "update_content", content: TEST_CONTENT });
  assert.equal(store.countOpenBlocking(run.id), 0);

  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "review",
    reviewerName: "sheen",
    expectedFingerprint: currentFingerprintOf(store.getRun(run.id)!),
  });
  assert.equal(out.kind, "ok");
  assert.equal(store.getRun(run.id)!.status, "READY_TO_RENDER");
  store.close();
});

test("waiving a blocking issue unblocks the gate without editing content", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });

  const content = { ...TEST_CONTENT, expansionNotes: ["Added industry context"] };
  act(store, run.id, { action: "update_content", content });

  const issue = store.listIssues(run.id).find((i) => i.code === "source_expansion")!;
  assert.equal(issue.status, "open");

  const waive = act(store, run.id, {
    action: "waive_issue",
    issueId: issue.id,
    expectedFindingFingerprint: issue.findingFingerprint,
    reviewerName: "sheen",
    note: "context is accurate and reviewed",
  });
  assert.equal(waive.kind, "ok");
  assert.equal(store.countOpenBlocking(run.id), 0);

  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "review",
    reviewerName: "sheen",
    expectedFingerprint: currentFingerprintOf(store.getRun(run.id)!),
  });
  assert.equal(out.kind, "ok");
  store.close();
});

test("waiving with a stale finding fingerprint is a conflict", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });

  act(store, run.id, {
    action: "update_content",
    content: { ...TEST_CONTENT, expansionNotes: ["note A"] },
  });
  const staleFp = store.listIssues(run.id).find((i) => i.code === "source_expansion")!
    .findingFingerprint;

  // The finding changes under the reviewer.
  act(store, run.id, {
    action: "update_content",
    content: { ...TEST_CONTENT, expansionNotes: ["note B, quite different"] },
  });
  const issue = store.listIssues(run.id).find((i) => i.code === "source_expansion")!;

  const out = act(store, run.id, {
    action: "waive_issue",
    issueId: issue.id,
    expectedFindingFingerprint: staleFp,
    reviewerName: "sheen",
    note: "stale",
  });

  assert.equal(out.kind, "guard");
  if (out.kind === "guard" && !out.guard.ok) {
    assert.equal(out.guard.code, "fingerprint_mismatch");
  }
  assert.equal(store.getRun(run.id)!.status, "REVIEW");
  store.close();
});

// ---------------------------------------------------------------------------
// final approval
// ---------------------------------------------------------------------------

test("final approval records both hashes and reaches APPROVED", () => {
  const store = newStore();
  const run = atApproval(store);

  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "approval",
    reviewerName: "sheen",
    note: "ship it",
    expectedFingerprint: currentFingerprintOf(run),
    expectedArtifactSha256: SHA,
  });

  assert.equal(out.kind, "ok");
  assert.equal(store.getRun(run.id)!.status, "APPROVED");

  const approval = store.listApprovals(run.id).at(-1)!;
  assert.equal(approval.gate, "approval");
  assert.equal(approval.decision, "approve");
  assert.equal(approval.artifactSha256, SHA);
  assert.equal(approval.contentFingerprint, currentFingerprintOf(run));
  assert.equal(approval.note, "ship it");
  store.close();
});

test("final approval is refused when the artifact file is missing", () => {
  const store = newStore();
  const run = atApproval(store);

  const out = act(
    store,
    run.id,
    {
      action: "approve_gate",
      gate: "approval",
      reviewerName: "sheen",
      expectedFingerprint: currentFingerprintOf(run),
      expectedArtifactSha256: SHA,
    },
    null // file gone
  );

  assert.equal(out.kind, "guard");
  if (out.kind === "guard" && !out.guard.ok) {
    assert.equal(out.guard.code, "artifact_missing");
  }
  assert.equal(store.getRun(run.id)!.status, "APPROVAL");
  store.close();
});

test("final approval is refused when the file on disk is corrupted", () => {
  const store = newStore();
  const run = atApproval(store);

  const out = act(
    store,
    run.id,
    {
      action: "approve_gate",
      gate: "approval",
      reviewerName: "sheen",
      expectedFingerprint: currentFingerprintOf(run),
      expectedArtifactSha256: SHA,
    },
    "sha-of-a-corrupted-file"
  );

  assert.equal(out.kind, "guard");
  if (out.kind === "guard" && !out.guard.ok) {
    assert.equal(out.guard.code, "artifact_mismatch");
  }
  store.close();
});

test("final approval is refused on a stale expected artifact hash", () => {
  const store = newStore();
  const run = atApproval(store);

  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "approval",
    reviewerName: "sheen",
    expectedFingerprint: currentFingerprintOf(run),
    expectedArtifactSha256: "hash-the-client-saw-earlier",
  });

  assert.equal(out.kind, "guard");
  if (out.kind === "guard" && !out.guard.ok) {
    assert.equal(out.guard.code, "fingerprint_mismatch");
  }
  store.close();
});

test("final approval is refused when QA failed", () => {
  const store = newStore();
  const run = atApproval(store);
  store.db
    .prepare(`UPDATE runs SET qa_json = ? WHERE id = ?`)
    .run(JSON.stringify({ verdict: "fail", checks: [] }), run.id);

  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "approval",
    reviewerName: "sheen",
    expectedFingerprint: currentFingerprintOf(run),
    expectedArtifactSha256: SHA,
  });

  assert.equal(out.kind, "guard");
  if (out.kind === "guard" && !out.guard.ok) assert.equal(out.guard.code, "qa_failed");
  store.close();
});

// ---------------------------------------------------------------------------
// request_changes: capture before invalidate
// ---------------------------------------------------------------------------

test("request_changes records the artifact it sent back, then clears the pointer", () => {
  const store = newStore();
  const run = atApproval(store);
  const fpBefore = currentFingerprintOf(run);

  const out = act(store, run.id, {
    action: "request_changes",
    reviewerName: "sheen",
    note: "tighten the results section",
  });

  assert.equal(out.kind, "ok");

  // The decision captured both values BEFORE invalidation.
  const decision = store.listApprovals(run.id).at(-1)!;
  assert.equal(decision.decision, "request_changes");
  assert.equal(decision.artifactSha256, SHA);
  assert.equal(decision.contentFingerprint, fpBefore);
  assert.equal(decision.note, "tighten the results section");

  // The active artifact metadata is gone.
  const after = store.getRun(run.id)!;
  assert.equal(after.status, "REVIEW");
  assert.equal(after.pdfPath, null);
  assert.equal(after.artifactSha256, null);
  assert.equal(after.renderedFingerprint, null);
  assert.equal(after.qa, null);
  store.close();
});

test("after request_changes the run is editable and re-approvable", () => {
  const store = newStore();
  const run = atApproval(store);
  act(store, run.id, { action: "request_changes", reviewerName: "s", note: "redo" });

  const edit = act(store, run.id, { action: "update_content", content: TEST_CONTENT });
  assert.equal(edit.kind, "ok");

  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "review",
    reviewerName: "s",
    expectedFingerprint: currentFingerprintOf(store.getRun(run.id)!),
  });
  assert.equal(out.kind, "ok");
  assert.equal(store.getRun(run.id)!.status, "READY_TO_RENDER");
  store.close();
});

test("final approval is impossible once the artifact pointer is cleared", () => {
  const store = newStore();
  const run = atApproval(store);
  act(store, run.id, { action: "request_changes", reviewerName: "s", note: "redo" });

  // Status is REVIEW now, so the approval gate is not even permitted.
  const out = act(store, run.id, {
    action: "approve_gate",
    gate: "approval",
    reviewerName: "s",
    expectedFingerprint: currentFingerprintOf(store.getRun(run.id)!),
    expectedArtifactSha256: SHA,
  });
  assert.equal(out.kind, "guard");
  store.close();
});

// ---------------------------------------------------------------------------
// reject
// ---------------------------------------------------------------------------

test("rejecting at APPROVAL identifies the rejected artifact", () => {
  const store = newStore();
  const run = atApproval(store);

  const out = act(store, run.id, {
    action: "reject",
    reviewerName: "sheen",
    note: "not usable",
  });

  assert.equal(out.kind, "ok");
  assert.equal(store.getRun(run.id)!.status, "REJECTED");
  const decision = store.listApprovals(run.id).at(-1)!;
  assert.equal(decision.gate, "approval");
  assert.equal(decision.artifactSha256, SHA);
  assert.equal(decision.contentFingerprint, currentFingerprintOf(run));
  store.close();
});

test("rejecting at REVIEW records no artifact", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });

  act(store, run.id, { action: "reject", reviewerName: "sheen", note: "bad extraction" });

  assert.equal(store.getRun(run.id)!.status, "REJECTED");
  const decision = store.listApprovals(run.id).at(-1)!;
  assert.equal(decision.gate, "review");
  assert.equal(decision.artifactSha256, null);
  store.close();
});

test("REJECTED is terminal — no action can move it", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });
  act(store, run.id, { action: "reject", reviewerName: "s", note: "n" });

  for (const action of [
    { action: "retry" } as RunAction,
    { action: "pause" } as RunAction,
    { action: "update_content", content: TEST_CONTENT } as RunAction,
  ]) {
    assert.equal(act(store, run.id, action).kind, "guard");
  }
  assert.equal(store.getRun(run.id)!.status, "REJECTED");
  store.close();
});

// ---------------------------------------------------------------------------
// retry resumes the failed stage
// ---------------------------------------------------------------------------

test("a render failure retries at READY_TO_RENDER and preserves edited content", () => {
  const store = newStore();
  const run = seedRun(store, { status: "FAILED", lastErrorStage: "render" });

  const edited = { ...TEST_CONTENT, title: "Human-edited title" };
  store.db
    .prepare(
      `UPDATE runs SET content_json = ?, render_attempts = 3, extract_attempts = 1 WHERE id = ?`
    )
    .run(JSON.stringify(edited), run.id);

  const out = act(store, run.id, { action: "retry" });
  assert.equal(out.kind, "ok");

  const after = store.getRun(run.id)!;
  assert.equal(after.status, "READY_TO_RENDER", "must not re-extract");
  assert.equal(after.content!.title, "Human-edited title", "edits must survive");
  assert.equal(after.renderAttempts, 0, "failed stage's counter resets");
  assert.equal(after.extractAttempts, 1, "other stage's counter is untouched");
  assert.equal(after.lastError, null);
  store.close();
});

test("an extract failure retries at QUEUED and resets only extract attempts", () => {
  const store = newStore();
  const run = seedRun(store, { status: "FAILED", lastErrorStage: "extract" });
  store.db
    .prepare(`UPDATE runs SET extract_attempts = 3, render_attempts = 2 WHERE id = ?`)
    .run(run.id);

  act(store, run.id, { action: "retry" });

  const after = store.getRun(run.id)!;
  assert.equal(after.status, "QUEUED");
  assert.equal(after.extractAttempts, 0);
  assert.equal(after.renderAttempts, 2);
  store.close();
});

// ---------------------------------------------------------------------------
// pause semantics
// ---------------------------------------------------------------------------

test("pause and resume are recorded and reflected on the run", () => {
  const store = newStore();
  const run = seedRun(store, { status: "QUEUED" });

  assert.equal(act(store, run.id, { action: "pause" }).kind, "ok");
  assert.equal(store.getRun(run.id)!.paused, true);
  assert.equal(act(store, run.id, { action: "resume" }).kind, "ok");
  assert.equal(store.getRun(run.id)!.paused, false);

  const types = store.listEvents(run.id).map((e) => e.type);
  assert.ok(types.includes("paused"));
  assert.ok(types.includes("resumed"));
  store.close();
});

test("an in-flight stage can be paused — it takes effect at the next claim", () => {
  const store = newStore();
  const run = seedRun(store, { status: "RENDERING" });
  // Phase 1 does not cancel the active render; pause only stops re-claiming.
  assert.equal(act(store, run.id, { action: "pause" }).kind, "ok");
  const after = store.getRun(run.id)!;
  assert.equal(after.paused, true);
  assert.equal(after.status, "RENDERING", "the running stage is not interrupted");
  store.close();
});

// ---------------------------------------------------------------------------
// transactionality
// ---------------------------------------------------------------------------

test("a failure mid-decision leaves no audit row, no event and no status change", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });
  const eventsBefore = store.listEvents(run.id).length;

  const boom = store.db.transaction(() => {
    applyAction({ store }, run.id, {
      action: "approve_gate",
      gate: "review",
      reviewerName: "sheen",
      expectedFingerprint: currentFingerprintOf(run),
    });
    throw new Error("crash after the decision was written");
  });

  assert.throws(() => boom.immediate(), /crash after the decision/);

  assert.equal(store.getRun(run.id)!.status, "REVIEW");
  assert.equal(store.listApprovals(run.id).length, 0);
  assert.equal(store.listEvents(run.id).length, eventsBefore);
  store.close();
});

test("issue reconciliation on edit shares the edit's transaction", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });

  const boom = store.db.transaction(() => {
    applyAction({ store }, run.id, {
      action: "update_content",
      content: { ...TEST_CONTENT, solutions: ["one"] },
    });
    throw new Error("rollback");
  });
  assert.throws(() => boom.immediate(), /rollback/);

  // Neither the content write nor the derived issues survived.
  assert.equal(store.getRun(run.id)!.content!.solutions.length, 4);
  assert.equal(store.countOpenBlocking(run.id), 0);
  store.close();
});

test("derived issues match what deriveIssues reports for the stored content", () => {
  const store = newStore();
  const run = seedRun(store, { status: "REVIEW" });
  const content = { ...TEST_CONTENT, goals: ["a", "b"] };

  act(store, run.id, { action: "update_content", content });

  const expected = deriveIssues({
    content,
    config: TEST_CONFIG,
    intakeRisks: TEST_AGENT.intake.risks,
  });
  assert.equal(store.listIssues(run.id).length, expected.length);
  store.close();
});

// ---------------------------------------------------------------------------
// terminal-state immutability
// ---------------------------------------------------------------------------

test("APPROVED is terminal — no action can move it", () => {
  const store = newStore();
  const run = atApproval(store);
  act(store, run.id, {
    action: "approve_gate",
    gate: "approval",
    reviewerName: "s",
    expectedFingerprint: currentFingerprintOf(run),
    expectedArtifactSha256: SHA,
  });
  assert.equal(store.getRun(run.id)!.status, "APPROVED");

  for (const action of [
    { action: "request_changes", reviewerName: "s", note: "n" } as RunAction,
    { action: "reject", reviewerName: "s", note: "n" } as RunAction,
    { action: "retry" } as RunAction,
    { action: "pause" } as RunAction,
  ]) {
    assert.equal(act(store, run.id, action).kind, "guard", action.action);
  }
  assert.equal(store.getRun(run.id)!.status, "APPROVED");
  store.close();
});

test("gate actions are refused in every non-gate state", () => {
  const store = newStore();
  for (const status of ["QUEUED", "EXTRACTING", "READY_TO_RENDER", "RENDERING"] as RunStatus[]) {
    const run = seedRun(store, { status });
    const out = act(store, run.id, {
      action: "approve_gate",
      gate: "review",
      reviewerName: "s",
      expectedFingerprint: currentFingerprintOf(run),
    });
    assert.equal(out.kind, "guard", `approve_gate should be refused in ${status}`);
  }
  store.close();
});
