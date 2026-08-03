import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { TEST_AGENT, TEST_CONFIG, TEST_CONTENT } from "./fixtures.js";
import { LEASE_MS, RunStore, backoffMs, fingerprint, sha256Hex } from "./store.js";
import type { QaReport } from "./types.js";

const CONFIG = TEST_CONFIG;
const CONTENT = TEST_CONTENT;
const AGENT = TEST_AGENT;
const QA: QaReport = { verdict: "pass", checks: [] };

// A mutable clock so lease expiry and backoff are testable without sleeping.
function harness() {
  const dir = mkdtempSync(path.join(tmpdir(), "ctp-runs-"));
  const dbPath = path.join(dir, "runs.db");
  const artifactRoot = path.join(dir, "pdfs");
  let now = new Date("2026-08-03T12:00:00.000Z");
  const clock = () => now;

  // TWO independent connections to the SAME file — a single in-memory handle
  // cannot demonstrate that two claimants do not collide.
  const a = new RunStore({ dbPath, artifactRoot, clock });
  const b = new RunStore({ dbPath, artifactRoot, clock });

  return {
    a,
    b,
    artifactRoot,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    cleanup() {
      a.close();
      b.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seed(store: RunStore, count = 1) {
  return store.createBatch({
    reviewPolicy: "only_when_flagged",
    approvalMode: "required",
    items: Array.from({ length: count }, (_, i) => ({
      name: `doc-${i}.txt`,
      rawContent: `content ${i} `.repeat(5),
      config: CONFIG,
    })),
  });
}

// ---------------------------------------------------------------------------
// atomic claim across connections
// ---------------------------------------------------------------------------

test("two connections never claim the same run", () => {
  const h = harness();
  seed(h.a, 1);

  const first = h.a.claimNext("w1");
  const second = h.b.claimNext("w2");

  assert.ok(first, "first claimant should get the run");
  assert.equal(second, null, "second claimant must get nothing");
  assert.equal(first!.status, "EXTRACTING");
  assert.equal(first!.lockedBy, "w1");
  h.cleanup();
});

test("concurrent claimants split a batch with no double-claim", () => {
  const h = harness();
  seed(h.a, 6);

  const claimed: string[] = [];
  for (let i = 0; i < 8; i++) {
    const run = (i % 2 === 0 ? h.a : h.b).claimNext(i % 2 === 0 ? "w1" : "w2");
    if (run) claimed.push(run.id);
  }

  assert.equal(claimed.length, 6);
  assert.equal(new Set(claimed).size, 6, "every claim must be a distinct run");
  h.cleanup();
});

test("claim is FIFO by created_at", () => {
  const h = harness();
  const { runs } = seed(h.a, 3);
  assert.equal(h.a.claimNext("w1")!.id, runs[0]!.id);
  assert.equal(h.a.claimNext("w1")!.id, runs[1]!.id);
  assert.equal(h.a.claimNext("w1")!.id, runs[2]!.id);
  h.cleanup();
});

test("claim increments only the stage's own attempt counter", () => {
  const h = harness();
  seed(h.a, 1);

  const extracting = h.a.claimNext("w1")!;
  assert.equal(extracting.extractAttempts, 1);
  assert.equal(extracting.renderAttempts, 0);

  // Move it to the render-claimable state and claim again.
  h.a.commitExtraction({
    runId: extracting.id, workerId: "w1", content: CONTENT, agent: AGENT,
    detected: [], chooseStatus: () => "READY_TO_RENDER",
  });
  const rendering = h.a.claimNext("w1")!;
  assert.equal(rendering.status, "RENDERING");
  assert.equal(rendering.extractAttempts, 1, "extract counter must not move");
  assert.equal(rendering.renderAttempts, 1);
  h.cleanup();
});

test("paused runs are never claimed, and resume makes them claimable again", () => {
  const h = harness();
  const { runs } = seed(h.a, 2);

  assert.equal(h.a.setPaused(runs[0]!.id, true, "user:sheen"), true);

  // The worker drains the rest and skips the paused one entirely.
  assert.equal(h.a.claimNext("w1")!.id, runs[1]!.id);
  assert.equal(h.a.claimNext("w1"), null);

  assert.equal(h.a.setPaused(runs[0]!.id, false, "user:sheen"), true);
  assert.equal(h.a.claimNext("w1")!.id, runs[0]!.id);
  h.cleanup();
});

test("setPaused is idempotent-safe: repeating the same state reports false", () => {
  const h = harness();
  const { runs } = seed(h.a, 1);
  assert.equal(h.a.setPaused(runs[0]!.id, true, "user:x"), true);
  assert.equal(h.a.setPaused(runs[0]!.id, true, "user:x"), false);
  h.cleanup();
});

test("a run with a future next_attempt_at is not claimed until it is due", () => {
  const h = harness();
  seed(h.a, 1);

  const run = h.a.claimNext("w1")!;
  assert.equal(
    h.a.scheduleRetry({
      runId: run.id, workerId: "w1", stage: "extract",
      error: "429 rate limited", attempts: 1,
    }),
    true
  );

  assert.equal(h.a.claimNext("w1"), null, "backoff must suppress the claim");

  h.advance(backoffMs(1) + 1);
  const retried = h.a.claimNext("w1");
  assert.ok(retried, "claimable once the backoff elapses");
  assert.equal(retried!.extractAttempts, 2);
  h.cleanup();
});

// ---------------------------------------------------------------------------
// recovery
// ---------------------------------------------------------------------------

test("recoverStale leaves a fresh lease alone", () => {
  const h = harness();
  seed(h.a, 1);
  const run = h.a.claimNext("w1")!;

  assert.equal(h.a.recoverStale(), 0);
  assert.equal(h.a.getRun(run.id)!.status, "EXTRACTING");
  h.cleanup();
});

test("boot recovery reclaims a fresh lease too — a crashed worker holds one", () => {
  const h = harness();
  seed(h.a, 1);
  const run = h.a.claimNext("w1")!;

  // Simulates kill -9: the lease is seconds old but its holder is gone. Waiting
  // out LEASE_MS would stall a crashed batch for ten minutes.
  assert.equal(h.a.recoverStale({ ignoreLease: true }), 1);

  const after = h.a.getRun(run.id)!;
  assert.equal(after.status, "QUEUED");
  assert.equal(after.lockedBy, null);
  assert.ok(h.a.listEvents(run.id).some((e) => e.type === "recovered"));
  h.cleanup();
});

test("boot recovery still refuses to touch gate or terminal states", () => {
  const h = harness();
  const { runs } = seed(h.a, 3);
  const states = ["REVIEW", "APPROVAL", "APPROVED"] as const;
  states.forEach((status, i) => {
    h.a.db.prepare(`UPDATE runs SET status=? WHERE id=?`).run(status, runs[i]!.id);
  });

  assert.equal(h.a.recoverStale({ ignoreLease: true }), 0);
  states.forEach((status, i) => {
    assert.equal(h.a.getRun(runs[i]!.id)!.status, status);
  });
  h.cleanup();
});

test("recoverStale returns expired transient runs to their claimable state", () => {
  const h = harness();
  const { runs } = seed(h.a, 2);

  const extracting = h.a.claimNext("w1")!;
  h.a.commitExtraction({
    runId: runs[1]!.id, workerId: "nobody", content: CONTENT, agent: AGENT,
    detected: [], chooseStatus: () => "READY_TO_RENDER",
  });

  // Put the second run into RENDERING properly.
  h.a.db.prepare(`UPDATE runs SET status='READY_TO_RENDER' WHERE id=?`).run(runs[1]!.id);
  const rendering = h.a.claimNext("w1")!;
  assert.equal(rendering.status, "RENDERING");

  h.advance(LEASE_MS + 1);
  assert.equal(h.a.recoverStale(), 2);

  assert.equal(h.a.getRun(extracting.id)!.status, "QUEUED");
  assert.equal(h.a.getRun(rendering.id)!.status, "READY_TO_RENDER");
  for (const id of [extracting.id, rendering.id]) {
    const r = h.a.getRun(id)!;
    assert.equal(r.lockedBy, null);
    assert.equal(r.lockedAt, null);
    assert.ok(h.a.listEvents(id).some((e) => e.type === "recovered"));
  }
  h.cleanup();
});

test("a reclaimed render does NOT restart extraction and keeps edited content", () => {
  const h = harness();
  seed(h.a, 1);

  const run = h.a.claimNext("w1")!;
  h.a.commitExtraction({
    runId: run.id, workerId: "w1", content: CONTENT, agent: AGENT,
    detected: [], chooseStatus: () => "READY_TO_RENDER",
  });

  const edited = { ...CONTENT, title: "Human-edited title" };
  h.a.db
    .prepare(`UPDATE runs SET content_json = ? WHERE id = ?`)
    .run(JSON.stringify(edited), run.id);

  h.a.claimNext("w1");
  h.advance(LEASE_MS + 1);
  h.a.recoverStale();

  const after = h.a.getRun(run.id)!;
  assert.equal(after.status, "READY_TO_RENDER", "must not fall back to QUEUED");
  assert.equal(after.content!.title, "Human-edited title");
  h.cleanup();
});

test("recoverStale never touches gate or terminal states", () => {
  const h = harness();
  const { runs } = seed(h.a, 5);
  const states = ["REVIEW", "APPROVAL", "APPROVED", "REJECTED", "FAILED"] as const;
  states.forEach((status, i) => {
    h.a.db
      .prepare(`UPDATE runs SET status=?, locked_at=NULL, locked_by=NULL WHERE id=?`)
      .run(status, runs[i]!.id);
  });

  h.advance(LEASE_MS * 10);
  assert.equal(h.a.recoverStale(), 0);

  states.forEach((status, i) => {
    assert.equal(h.a.getRun(runs[i]!.id)!.status, status);
  });
  h.cleanup();
});

// ---------------------------------------------------------------------------
// lease ownership
// ---------------------------------------------------------------------------

test("a worker that lost its lease cannot commit an extraction", () => {
  const h = harness();
  seed(h.a, 1);
  const run = h.a.claimNext("w1")!;

  h.advance(LEASE_MS + 1);
  h.b.recoverStale();
  const stolen = h.b.claimNext("w2")!;
  assert.equal(stolen.lockedBy, "w2");

  // The original worker finally returns with its result.
  const ok = h.a.commitExtraction({
    runId: run.id, workerId: "w1", content: { ...CONTENT, title: "stale result" },
    agent: AGENT, detected: [], chooseStatus: () => "READY_TO_RENDER",
  });

  assert.equal(ok, false, "stale write must be rejected");
  const after = h.a.getRun(run.id)!;
  assert.equal(after.status, "EXTRACTING", "still owned by w2");
  assert.equal(after.lockedBy, "w2");
  assert.equal(after.content, null, "no content written by the stale worker");
  h.cleanup();
});

test("scheduleRetry, markFailed and routeRenderToReview all respect the lease", () => {
  const h = harness();
  const { runs } = seed(h.a, 1);
  const id = runs[0]!.id;

  h.a.claimNext("w1");
  h.a.db.prepare(`UPDATE runs SET locked_by='someone-else' WHERE id=?`).run(id);

  assert.equal(
    h.a.scheduleRetry({ runId: id, workerId: "w1", stage: "extract", error: "e", attempts: 1 }),
    false
  );
  assert.equal(
    h.a.markFailed({ runId: id, workerId: "w1", stage: "extract", error: "e" }),
    false
  );
  h.a.db.prepare(`UPDATE runs SET status='RENDERING' WHERE id=?`).run(id);
  assert.equal(
    h.a.routeRenderToReview({ runId: id, workerId: "w1", reason: "r" }),
    false
  );

  assert.equal(h.a.getRun(id)!.status, "RENDERING");
  h.cleanup();
});

// ---------------------------------------------------------------------------
// artifact commit
// ---------------------------------------------------------------------------

function toRendering(h: ReturnType<typeof harness>) {
  const { runs } = seed(h.a, 1);
  const id = runs[0]!.id;
  h.a.claimNext("w1");
  h.a.commitExtraction({
    runId: id, workerId: "w1", content: CONTENT, agent: AGENT,
    detected: [], chooseStatus: () => "READY_TO_RENDER",
  });
  const rendering = h.a.claimNext("w1")!;
  assert.equal(rendering.status, "RENDERING");
  return id;
}

test("commitRender writes a content-addressed artifact and points the run at it", () => {
  const h = harness();
  const id = toRendering(h);
  const pdf = Buffer.from("%PDF-1.7 fake bytes");
  const fp = fingerprint(CONTENT, CONFIG);

  const result = h.a.commitRender({
    runId: id, workerId: "w1", pdf, qa: QA,
    renderedFingerprint: fp, nextStatus: "APPROVAL",
  });

  assert.equal(result.committed, true);
  assert.equal(result.artifactSha256, sha256Hex(pdf));
  assert.ok(existsSync(result.artifactPath));
  assert.equal(path.basename(result.artifactPath), `${sha256Hex(pdf)}.pdf`);

  const run = h.a.getRun(id)!;
  assert.equal(run.status, "APPROVAL");
  assert.equal(run.pdfPath, result.artifactPath);
  assert.equal(run.artifactSha256, sha256Hex(pdf));
  assert.equal(run.renderedFingerprint, fp);
  assert.equal(run.qa!.verdict, "pass");
  assert.equal(run.lockedBy, null);
  h.cleanup();
});

test("commitRender leaves no temp files behind", () => {
  const h = harness();
  const id = toRendering(h);
  h.a.commitRender({
    runId: id, workerId: "w1", pdf: Buffer.from("x"), qa: QA,
    renderedFingerprint: "fp", nextStatus: "APPROVAL",
  });
  const files = readdirSync(path.join(h.artifactRoot, id));
  assert.deepEqual(files.filter((f) => f.startsWith(".tmp-")), []);
  h.cleanup();
});

test("a worker that lost its lease discards its artifact and does not overwrite state", () => {
  const h = harness();
  const id = toRendering(h);

  // Lease stolen while the render is in flight.
  h.a.db.prepare(`UPDATE runs SET locked_by='w2' WHERE id=?`).run(id);

  const result = h.a.commitRender({
    runId: id, workerId: "w1", pdf: Buffer.from("stale render"), qa: QA,
    renderedFingerprint: "fp", nextStatus: "APPROVAL",
  });

  assert.equal(result.committed, false);
  assert.ok(!existsSync(result.artifactPath), "stale artifact must be deleted");

  const run = h.a.getRun(id)!;
  assert.equal(run.status, "RENDERING", "state untouched");
  assert.equal(run.pdfPath, null);
  assert.equal(run.artifactSha256, null);
  assert.ok(
    h.a.listEvents(id).some((e) => e.type === "render_discarded"),
    "discard must be recorded"
  );
  h.cleanup();
});

test("a loser producing byte-identical output does not delete the winner's artifact", () => {
  const h = harness();
  const id = toRendering(h);
  const pdf = Buffer.from("%PDF identical bytes");

  // Winner commits first.
  const winner = h.a.commitRender({
    runId: id, workerId: "w1", pdf, qa: QA,
    renderedFingerprint: "fp", nextStatus: "APPROVAL",
  });
  assert.equal(winner.committed, true);

  // A second worker, no longer the owner, produces the same bytes — so the same
  // content-addressed path. It must not delete the committed file.
  const loser = h.a.commitRender({
    runId: id, workerId: "w-late", pdf, qa: QA,
    renderedFingerprint: "fp", nextStatus: "APPROVAL",
  });

  assert.equal(loser.committed, false);
  assert.equal(loser.artifactPath, winner.artifactPath);
  assert.ok(existsSync(winner.artifactPath), "winner's artifact must survive");
  assert.equal(h.a.getRun(id)!.pdfPath, winner.artifactPath);
  h.cleanup();
});

// ---------------------------------------------------------------------------
// artifact retention
// ---------------------------------------------------------------------------

test("audit-referenced and superseded artifacts are both retained", () => {
  const h = harness();
  const id = toRendering(h);

  const oldPdf = Buffer.from("old render");
  const first = h.a.commitRender({
    runId: id, workerId: "w1", pdf: oldPdf, qa: QA,
    renderedFingerprint: "fp1", nextStatus: "APPROVAL",
  });

  // request_changes-style: the decision names the artifact, then the active
  // pointer is cleared. The file itself is audit evidence and must survive.
  h.a.insertApproval({
    runId: id, gate: "approval", decision: "request_changes",
    reviewerName: "sheen", note: "redo", contentFingerprint: "fp1",
    artifactSha256: first.artifactSha256,
  });
  h.a.db
    .prepare(
      `UPDATE runs SET status='READY_TO_RENDER', pdf_path=NULL,
                      artifact_sha256=NULL, rendered_fingerprint=NULL,
                      qa_json=NULL WHERE id=?`
    )
    .run(id);

  h.a.claimNext("w1");
  const second = h.a.commitRender({
    runId: id, workerId: "w1", pdf: Buffer.from("new render"), qa: QA,
    renderedFingerprint: "fp2", nextStatus: "APPROVAL",
  });

  assert.ok(existsSync(second.artifactPath), "active artifact retained");
  assert.ok(
    existsSync(first.artifactPath),
    "artifact named by a decision record must NOT be deleted"
  );
  // referencedArtifactShas encodes the retention invariant later cleanup must honour.
  assert.ok(h.a.referencedArtifactShas(id).has(first.artifactSha256));
  h.cleanup();
});

test("committing does not delete another worker's in-flight temp file", () => {
  const h = harness();
  const id = toRendering(h);

  const dir = path.join(h.artifactRoot, id);
  mkdirSync(dir, { recursive: true });
  const foreignTmp = path.join(dir, ".tmp-other-worker-abc.pdf");
  writeFileSync(foreignTmp, "in flight elsewhere");
  const supersededArtifact = path.join(dir, `${"a".repeat(64)}.pdf`);
  writeFileSync(supersededArtifact, "an earlier render");

  const committed = h.a.commitRender({
    runId: id, workerId: "w1", pdf: Buffer.from("real"), qa: QA,
    renderedFingerprint: "fp", nextStatus: "APPROVAL",
  });

  assert.ok(existsSync(committed.artifactPath));
  assert.ok(existsSync(foreignTmp), "another worker's temp file must be left alone");
  // Orphan cleanup is deferred, so a superseded artifact is retained rather than
  // risk racing another worker's rename-then-commit window.
  assert.ok(existsSync(supersededArtifact));
  h.cleanup();
});

test("cleanup removes a worker's own temp leftovers only", () => {
  const h = harness();
  const id = toRendering(h);
  const dir = path.join(h.artifactRoot, id);
  mkdirSync(dir, { recursive: true });

  const mine = path.join(dir, ".tmp-w1-abandoned.pdf");
  const theirs = path.join(dir, ".tmp-w2-in-flight.pdf");
  const unattributable = path.join(dir, ".tmp-stray.pdf");
  writeFileSync(mine, "my leftover");
  writeFileSync(theirs, "someone else is writing this");
  writeFileSync(unattributable, "ownership cannot be established");

  const removed = h.a.cleanupOwnTempFiles(id, "w1");

  assert.ok(!existsSync(mine), "own leftover should be removed");
  assert.deepEqual(removed, [mine]);
  assert.ok(existsSync(theirs), "another worker's in-flight file must survive");
  assert.ok(
    existsSync(unattributable),
    "a temp file whose owner cannot be established must be left alone"
  );
  h.cleanup();
});

test("startup cleanup cannot delete a temp artifact owned by another active worker", () => {
  const h = harness();
  const id = toRendering(h);
  const dir = path.join(h.artifactRoot, id);
  mkdirSync(dir, { recursive: true });

  // A second local backend process shares this DATA_DIR while its worker (w-live)
  // is mid-render. Nothing a booting process does may touch that file.
  const liveTemp = path.join(dir, ".tmp-w-live-rendering-now.pdf");
  writeFileSync(liveTemp, "in-flight render from another process");

  // Simulate that boot: a fresh store on the same DATA_DIR, plus the boot-time
  // recovery sweep. There is no boot-wide temp sweep by design.
  const booting = new RunStore({
    dbPath: path.join(h.artifactRoot, "..", "runs.db"),
    artifactRoot: h.artifactRoot,
  });
  booting.recoverStale({ ignoreLease: true });
  booting.close();

  assert.ok(
    existsSync(liveTemp),
    "boot must not delete another worker's in-flight temp artifact"
  );

  // And a booting worker with a different id still cannot reach it.
  const removed = h.a.cleanupOwnTempFiles(id, "w-booting");
  assert.deepEqual(removed, []);
  assert.ok(existsSync(liveTemp));

  // Only its actual owner can.
  assert.deepEqual(h.a.cleanupOwnTempFiles(id, "w-live"), [liveTemp]);
  assert.ok(!existsSync(liveTemp));
  h.cleanup();
});

test("a committed artifact is never deleted by cleanup", () => {
  const h = harness();
  const id = toRendering(h);

  const committed = h.a.commitRender({
    runId: id, workerId: "w1", pdf: Buffer.from("real output"), qa: QA,
    renderedFingerprint: "fp", nextStatus: "APPROVAL",
  });
  assert.ok(existsSync(committed.artifactPath));

  // Cleanup by any worker id touches only .tmp-* files.
  h.a.cleanupOwnTempFiles(id, "w1");
  h.a.cleanupOwnTempFiles(id, "w2");
  assert.ok(existsSync(committed.artifactPath));
  h.cleanup();
});

// ---------------------------------------------------------------------------
// backoff shape
// ---------------------------------------------------------------------------

test("backoff grows and is capped at five minutes", () => {
  assert.equal(backoffMs(0), 5_000);
  assert.equal(backoffMs(1), 10_000);
  assert.equal(backoffMs(2), 20_000);
  assert.ok(backoffMs(3) > backoffMs(2));
  assert.equal(backoffMs(99), 5 * 60_000);
});
