import assert from "node:assert/strict";
import test from "node:test";

import { PdfRenderConfigSchema } from "../shared/useCaseSchema.js";
import { RunStore, fingerprint, sha256Hex } from "./store.js";

const CONFIG = PdfRenderConfigSchema.parse({ templateId: "usecase" });

function newStore(): RunStore {
  // In-memory is fine for CRUD / reconciliation / pure logic. Claim-contention
  // tests need a file-backed DB with two connections — see store.claim.test.ts.
  return new RunStore({ dbPath: ":memory:", artifactRoot: "/tmp/does-not-matter" });
}

function seed(store: RunStore, count = 1) {
  return store.createBatch({
    reviewPolicy: "only_when_flagged",
    approvalMode: "required",
    items: Array.from({ length: count }, (_, i) => ({
      name: `doc-${i}.txt`,
      rawContent: `raw content for document number ${i}, long enough to be valid`,
      config: CONFIG,
    })),
  });
}

// ---------------------------------------------------------------------------
// fingerprint
// ---------------------------------------------------------------------------

test("fingerprint is stable under key reordering", () => {
  const a = fingerprint({ x: 1, y: [1, 2], z: { m: 1, n: 2 } }, { p: 1, q: 2 });
  const b = fingerprint({ z: { n: 2, m: 1 }, y: [1, 2], x: 1 }, { q: 2, p: 1 });
  assert.equal(a, b);
});

test("fingerprint is sensitive to values, and array order still matters", () => {
  const base = fingerprint({ x: 1 }, { p: 1 });
  assert.notEqual(base, fingerprint({ x: 2 }, { p: 1 }));
  assert.notEqual(base, fingerprint({ x: 1 }, { p: 2 }));
  // Array order is semantic (bullet order), so it must not be normalized away.
  assert.notEqual(
    fingerprint({ a: [1, 2] }, {}),
    fingerprint({ a: [2, 1] }, {})
  );
});

test("fingerprint covers config, not just content", () => {
  const content = { title: "t" };
  assert.notEqual(
    fingerprint(content, { ...CONFIG, primaryColor: "#000000" }),
    fingerprint(content, { ...CONFIG, primaryColor: "#111111" })
  );
});

test("sha256Hex matches for equal buffers and strings", () => {
  assert.equal(sha256Hex("abc"), sha256Hex(Buffer.from("abc")));
  assert.equal(sha256Hex("abc").length, 64);
});

// ---------------------------------------------------------------------------
// batch / run creation
// ---------------------------------------------------------------------------

test("createBatch inserts batch and runs atomically, all QUEUED", () => {
  const store = newStore();
  const { batch, runs } = seed(store, 3);

  assert.equal(runs.length, 3);
  assert.equal(store.getBatch(batch.id)?.reviewPolicy, "only_when_flagged");
  for (const run of runs) {
    assert.equal(run.status, "QUEUED");
    assert.equal(run.paused, false);
    assert.equal(run.extractAttempts, 0);
    assert.equal(run.renderAttempts, 0);
    assert.equal(run.content, null);
    assert.equal(run.pdfPath, null);
    assert.equal(run.artifactSha256, null);
  }
  store.close();
});

test("policy is snapshotted onto each run, not referenced from the batch", () => {
  const store = newStore();
  const { batch, runs } = store.createBatch({
    reviewPolicy: "always",
    approvalMode: "auto_if_clean",
    items: [{ name: "a", rawContent: "x".repeat(30), config: CONFIG }],
  });

  assert.equal(runs[0]!.reviewPolicy, "always");
  assert.equal(runs[0]!.approvalMode, "auto_if_clean");

  // Mutating the batch must not retroactively change in-flight runs.
  store.db
    .prepare(`UPDATE batches SET review_policy = 'only_when_flagged' WHERE id = ?`)
    .run(batch.id);

  assert.equal(store.getRun(runs[0]!.id)!.reviewPolicy, "always");
  store.close();
});

test("config round-trips through JSON unchanged", () => {
  const store = newStore();
  const { runs } = seed(store);
  assert.deepEqual(store.getRun(runs[0]!.id)!.config, CONFIG);
  store.close();
});

// ---------------------------------------------------------------------------
// list projection
// ---------------------------------------------------------------------------

test("listRuns filters by status and batchId", () => {
  const store = newStore();
  const first = seed(store, 2);
  const second = seed(store, 1);

  assert.equal(store.listRuns().length, 3);
  assert.equal(store.listRuns({ batchId: first.batch.id }).length, 2);
  assert.equal(store.listRuns({ status: "QUEUED" }).length, 3);
  assert.equal(store.listRuns({ status: "APPROVED" }).length, 0);
  assert.equal(
    store.listRuns({ batchId: second.batch.id, status: "QUEUED" }).length,
    1
  );
  store.close();
});

test("listRuns reports hasArtifact and open blocking count without loading blobs", () => {
  const store = newStore();
  const { runs } = seed(store);
  const id = runs[0]!.id;

  let summary = store.listRuns()[0]!;
  assert.equal(summary.hasArtifact, false);
  assert.equal(summary.openBlockingCount, 0);
  assert.equal(summary.qaVerdict, null);
  // The projection must not expose the heavy columns at all.
  const asRecord = summary as unknown as Record<string, unknown>;
  assert.equal(asRecord.config, undefined);
  assert.equal(asRecord.content, undefined);

  store.db
    .prepare(
      `UPDATE runs SET pdf_path = '/x/y.pdf',
                       qa_json = '{"verdict":"warn","checks":[]}' WHERE id = ?`
    )
    .run(id);
  store.db
    .prepare(
      `INSERT INTO run_issues
         (id, run_id, issue_key, finding_fingerprint, code, severity, source,
          message, status, detected_at, last_seen_at)
       VALUES ('i1', ?, 'k1', 'f1', 'render_validation', 'blocking',
               'render_validation', 'nope', 'open', '2026-01-01', '2026-01-01')`
    )
    .run(id);

  summary = store.listRuns()[0]!;
  assert.equal(summary.hasArtifact, true);
  assert.equal(summary.qaVerdict, "warn");
  assert.equal(summary.openBlockingCount, 1);
  store.close();
});

test("countOpenBlocking ignores warnings and non-open statuses", () => {
  const store = newStore();
  const { runs } = seed(store);
  const id = runs[0]!.id;

  const insert = store.db.prepare(
    `INSERT INTO run_issues
       (id, run_id, issue_key, finding_fingerprint, code, severity, source,
        message, status, detected_at, last_seen_at)
     VALUES (@id, @runId, @key, 'f', 'c', @severity, 'intake', 'm', @status,
             '2026-01-01', '2026-01-01')`
  );
  insert.run({ id: "a", runId: id, key: "k1", severity: "blocking", status: "open" });
  insert.run({ id: "b", runId: id, key: "k2", severity: "blocking", status: "waived" });
  insert.run({ id: "c", runId: id, key: "k3", severity: "blocking", status: "resolved" });
  insert.run({ id: "d", runId: id, key: "k4", severity: "warning", status: "open" });

  assert.equal(store.countOpenBlocking(id), 1);
  store.close();
});

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

test("createBatch records a creation event per run", () => {
  const store = newStore();
  const { runs } = seed(store, 2);
  for (const run of runs) {
    const events = store.listEvents(run.id);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.seq, 1);
    assert.equal(events[0]!.toStatus, "QUEUED");
    assert.equal(events[0]!.actor, "system");
  }
  store.close();
});

test("event seq is gapless and per-run", () => {
  const store = newStore();
  const { runs } = seed(store, 2);
  const [a, b] = runs;

  store.appendEvent({ runId: a!.id, type: "claimed", actor: "worker:1" });
  store.appendEvent({ runId: a!.id, type: "transition", actor: "worker:1" });
  store.appendEvent({ runId: b!.id, type: "claimed", actor: "worker:1" });

  assert.deepEqual(
    store.listEvents(a!.id).map((e) => e.seq),
    [1, 2, 3]
  );
  // Sequences are independent per run, not global.
  assert.deepEqual(
    store.listEvents(b!.id).map((e) => e.seq),
    [1, 2]
  );
  store.close();
});

test("events round-trip their detail payload", () => {
  const store = newStore();
  const { runs } = seed(store);
  store.appendEvent({
    runId: runs[0]!.id,
    type: "retry_scheduled",
    actor: "worker:1",
    fromStatus: "EXTRACTING",
    toStatus: "QUEUED",
    detail: { attempt: 2, backoffMs: 10_000 },
  });
  const event = store.listEvents(runs[0]!.id).at(-1)!;
  assert.equal(event.fromStatus, "EXTRACTING");
  assert.equal(event.toStatus, "QUEUED");
  assert.deepEqual(event.detail, { attempt: 2, backoffMs: 10_000 });
  store.close();
});

test("a rolled-back transaction leaves no event and no seq gap", () => {
  const store = newStore();
  const { runs } = seed(store);
  const id = runs[0]!.id;

  const boom = store.db.transaction(() => {
    store.appendEvent({ runId: id, type: "decision", actor: "user:sheen" });
    throw new Error("rollback");
  });

  assert.throws(() => boom(), /rollback/);

  // Still just the creation event, and the next seq is 2 — not 3.
  assert.deepEqual(
    store.listEvents(id).map((e) => e.seq),
    [1]
  );
  store.appendEvent({ runId: id, type: "claimed", actor: "worker:1" });
  assert.equal(store.listEvents(id).at(-1)!.seq, 2);
  store.close();
});

// ---------------------------------------------------------------------------
// approvals
// ---------------------------------------------------------------------------

test("approvals are append-only and ordered", () => {
  const store = newStore();
  const { runs } = seed(store);
  const id = runs[0]!.id;

  store.insertApproval({
    runId: id,
    gate: "approval",
    decision: "request_changes",
    reviewerName: "sheen",
    note: "tighten results",
    contentFingerprint: "fp1",
    artifactSha256: "sha1",
  });
  store.insertApproval({
    runId: id,
    gate: "review",
    decision: "approve",
    reviewerName: "sheen",
    contentFingerprint: "fp2",
  });

  const all = store.listApprovals(id);
  assert.equal(all.length, 2);
  assert.equal(all[0]!.decision, "request_changes");
  assert.equal(all[0]!.artifactSha256, "sha1");
  // Review-gate decisions have no active artifact to bind to.
  assert.equal(all[1]!.artifactSha256, null);
  assert.equal(all[1]!.note, null);
  store.close();
});

test("approval order is insertion order even within the same millisecond", () => {
  const store = newStore();
  const { runs } = seed(store);
  const id = runs[0]!.id;

  // Same-millisecond inserts must not reorder: decided_at ties, so ordering has
  // to fall back to insertion order (rowid), never to a random UUID.
  for (let i = 0; i < 12; i++) {
    store.insertApproval({
      runId: id,
      gate: "review",
      decision: "request_changes",
      reviewerName: "sheen",
      note: `note-${i}`,
      contentFingerprint: "fp",
    });
  }

  assert.deepEqual(
    store.listApprovals(id).map((a) => a.note),
    Array.from({ length: 12 }, (_, i) => `note-${i}`)
  );
  store.close();
});

test("referencedArtifactShas collects every hash the audit trail names", () => {
  const store = newStore();
  const { runs } = seed(store);
  const id = runs[0]!.id;

  store.insertApproval({
    runId: id, gate: "approval", decision: "request_changes",
    reviewerName: "a", contentFingerprint: "fp", artifactSha256: "sha-old",
  });
  store.insertApproval({
    runId: id, gate: "review", decision: "approve",
    reviewerName: "a", contentFingerprint: "fp",
  });
  store.insertApproval({
    runId: id, gate: "approval", decision: "approve",
    reviewerName: "a", contentFingerprint: "fp", artifactSha256: "sha-new",
  });

  const refs = store.referencedArtifactShas(id);
  // Both the rejected and the approved artifact are audit evidence.
  assert.deepEqual([...refs].sort(), ["sha-new", "sha-old"]);
  store.close();
});
