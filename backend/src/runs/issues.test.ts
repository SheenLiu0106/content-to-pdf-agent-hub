import assert from "node:assert/strict";
import test from "node:test";

import { PdfRenderConfigSchema } from "../shared/useCaseSchema.js";
import { RunStore, findingFingerprintOf, issueKeyOf } from "./store.js";
import type { DetectedIssue } from "./types.js";

const CONFIG = PdfRenderConfigSchema.parse({ templateId: "usecase" });

function newStore(): RunStore {
  return new RunStore({ dbPath: ":memory:", artifactRoot: "/tmp/irrelevant" });
}

function seedRun(store: RunStore): string {
  const { runs } = store.createBatch({
    reviewPolicy: "only_when_flagged",
    approvalMode: "required",
    items: [{ name: "d.txt", rawContent: "x".repeat(40), config: CONFIG }],
  });
  return runs[0]!.id;
}

const bulletCount = (n: number): DetectedIssue => ({
  code: "render_validation",
  severity: "blocking",
  source: "render_validation",
  locator: "summary.solutions",
  message: `Solutions needs exactly 4 bullets (currently ${n}).`,
  detail: `count=${n}`,
});

const expansion: DetectedIssue = {
  code: "source_expansion",
  severity: "blocking",
  source: "extraction",
  locator: "expansionNotes.0",
  message: "Added industry context not present in the source.",
};

// ---------------------------------------------------------------------------
// key vs fingerprint granularity
// ---------------------------------------------------------------------------

test("issueKey is stable across differing findings at the same location", () => {
  assert.equal(issueKeyOf(bulletCount(6)), issueKeyOf(bulletCount(9)));
});

test("findingFingerprint changes when the observed values change", () => {
  assert.notEqual(
    findingFingerprintOf(bulletCount(6)),
    findingFingerprintOf(bulletCount(9))
  );
});

test("findingFingerprint ignores incidental whitespace in the message", () => {
  const a: DetectedIssue = { ...expansion, message: "Added  context." };
  const b: DetectedIssue = { ...expansion, message: " Added context.  " };
  assert.notEqual(a.message, b.message);
  assert.equal(findingFingerprintOf(a), findingFingerprintOf(b));
});

test("issueKey separates different locations and codes", () => {
  assert.notEqual(
    issueKeyOf(bulletCount(6)),
    issueKeyOf({ ...bulletCount(6), locator: "summary.goals" })
  );
  assert.notEqual(issueKeyOf(bulletCount(6)), issueKeyOf(expansion));
});

// ---------------------------------------------------------------------------
// reconciliation
// ---------------------------------------------------------------------------

test("first detection inserts open issues and emits issue_opened", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(runId, [bulletCount(6), expansion], "worker:1");

  const issues = store.listIssues(runId);
  assert.equal(issues.length, 2);
  assert.ok(issues.every((i) => i.status === "open"));
  assert.equal(store.countOpenBlocking(runId), 2);
  assert.equal(
    store.listEvents(runId).filter((e) => e.type === "issue_opened").length,
    2
  );
  store.close();
});

test("identical re-detection is idempotent and bumps last_seen_at only", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(runId, [bulletCount(6)], "worker:1");
  const first = store.listIssues(runId)[0]!;

  store.syncIssues(runId, [bulletCount(6)], "worker:1");
  const second = store.listIssues(runId)[0]!;

  assert.equal(store.listIssues(runId).length, 1);
  assert.equal(second.id, first.id);
  assert.equal(second.status, "open");
  // No duplicate open event for the same finding.
  assert.equal(
    store.listEvents(runId).filter((e) => e.type === "issue_opened").length,
    1
  );
  store.close();
});

test("a waived issue stays waived across identical re-detection", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(runId, [bulletCount(6)], "worker:1");
  const issue = store.listIssues(runId)[0]!;

  assert.equal(
    store.waiveIssue({
      issueId: issue.id,
      expectedFindingFingerprint: issue.findingFingerprint,
      reviewerName: "sheen",
      note: "intentional, six is correct for this customer",
    }),
    true
  );
  assert.equal(store.countOpenBlocking(runId), 0);

  // The detector keeps firing — that must not undo the human decision.
  store.syncIssues(runId, [bulletCount(6)], "worker:1");

  const after = store.listIssues(runId)[0]!;
  assert.equal(after.status, "waived");
  assert.equal(after.resolutionAction, "waived");
  assert.equal(after.resolutionReviewerName, "sheen");
  assert.equal(store.countOpenBlocking(runId), 0);
  store.close();
});

test("a CHANGED finding at the same location reopens a waived issue", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(runId, [bulletCount(6)], "worker:1");
  const issue = store.listIssues(runId)[0]!;
  store.waiveIssue({
    issueId: issue.id,
    expectedFindingFingerprint: issue.findingFingerprint,
    reviewerName: "sheen",
    note: "six is fine",
  });
  assert.equal(store.countOpenBlocking(runId), 0);

  // Content edited: same location, different finding. The waiver applied to the
  // finding that was reviewed, not to the location forever.
  store.syncIssues(runId, [bulletCount(9)], "worker:1");

  const after = store.listIssues(runId)[0]!;
  assert.equal(after.id, issue.id, "should reuse the row, not duplicate it");
  assert.equal(after.status, "open");
  assert.equal(after.resolutionAction, null);
  assert.equal(after.resolutionReviewerName, null);
  assert.equal(after.resolutionNote, null);
  assert.equal(after.resolvedAt, null);
  assert.match(after.message, /currently 9/);
  assert.equal(store.countOpenBlocking(runId), 1);
  assert.equal(
    store.listEvents(runId).filter((e) => e.type === "issue_reopened").length,
    1
  );
  store.close();
});

test("an open issue the detector stops emitting is auto-cleared", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(runId, [bulletCount(6), expansion], "worker:1");
  assert.equal(store.countOpenBlocking(runId), 2);

  // Bullet count fixed; expansion note still present.
  store.syncIssues(runId, [expansion], "worker:1");

  const byCode = new Map(store.listIssues(runId).map((i) => [i.code, i]));
  assert.equal(byCode.get("render_validation")!.status, "resolved");
  assert.equal(byCode.get("render_validation")!.resolutionAction, "auto_cleared");
  assert.equal(byCode.get("source_expansion")!.status, "open");
  assert.equal(store.countOpenBlocking(runId), 1);
  assert.equal(
    store.listEvents(runId).filter((e) => e.type === "issue_auto_cleared").length,
    1
  );
  store.close();
});

test("a waived issue is not touched when the detector goes quiet", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(runId, [bulletCount(6)], "worker:1");
  const issue = store.listIssues(runId)[0]!;
  store.waiveIssue({
    issueId: issue.id,
    expectedFindingFingerprint: issue.findingFingerprint,
    reviewerName: "sheen",
    note: "ok",
  });

  store.syncIssues(runId, [], "worker:1");

  const after = store.listIssues(runId)[0]!;
  // Stays 'waived', not rewritten to 'resolved' — the human decision is the
  // more informative audit fact.
  assert.equal(after.status, "waived");
  assert.equal(after.resolutionReviewerName, "sheen");
  store.close();
});

test("an auto-cleared issue reopens if the detector fires again", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(runId, [bulletCount(6)], "worker:1");
  store.syncIssues(runId, [], "worker:1");
  assert.equal(store.listIssues(runId)[0]!.status, "resolved");

  // Same finding as originally detected: fingerprint matches the stored row, so
  // the resolution is preserved rather than reopened.
  store.syncIssues(runId, [bulletCount(6)], "worker:1");
  assert.equal(store.listIssues(runId)[0]!.status, "resolved");

  // A different finding at that location does reopen.
  store.syncIssues(runId, [bulletCount(9)], "worker:1");
  assert.equal(store.listIssues(runId)[0]!.status, "open");
  store.close();
});

// ---------------------------------------------------------------------------
// waiver integrity
// ---------------------------------------------------------------------------

test("waiveIssue rejects a stale finding fingerprint", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(runId, [bulletCount(6)], "worker:1");
  const stale = store.listIssues(runId)[0]!.findingFingerprint;

  // Finding changes under the reviewer's feet.
  store.syncIssues(runId, [bulletCount(9)], "worker:1");
  const issue = store.listIssues(runId)[0]!;

  assert.equal(
    store.waiveIssue({
      issueId: issue.id,
      expectedFindingFingerprint: stale,
      reviewerName: "sheen",
      note: "stale attempt",
    }),
    false
  );
  assert.equal(store.listIssues(runId)[0]!.status, "open");
  assert.equal(store.countOpenBlocking(runId), 1);

  // With the current fingerprint it succeeds.
  assert.equal(
    store.waiveIssue({
      issueId: issue.id,
      expectedFindingFingerprint: issue.findingFingerprint,
      reviewerName: "sheen",
      note: "nine is intentional",
    }),
    true
  );
  assert.equal(store.countOpenBlocking(runId), 0);
  store.close();
});

test("waiveIssue on an unknown id reports failure", () => {
  const store = newStore();
  seedRun(store);
  assert.equal(
    store.waiveIssue({
      issueId: "nope",
      expectedFindingFingerprint: "x",
      reviewerName: "sheen",
      note: "n",
    }),
    false
  );
  store.close();
});

test("syncIssues shares the caller's transaction and rolls back with it", () => {
  const store = newStore();
  const runId = seedRun(store);

  const boom = store.db.transaction(() => {
    store.syncIssues(runId, [bulletCount(6)], "worker:1");
    throw new Error("rollback");
  });
  assert.throws(() => boom(), /rollback/);

  assert.equal(store.listIssues(runId).length, 0);
  assert.equal(store.countOpenBlocking(runId), 0);
  assert.equal(
    store.listEvents(runId).filter((e) => e.type === "issue_opened").length,
    0
  );
  store.close();
});

test("syncAndCountOpenBlocking reports OPEN blocking, not everything detected", () => {
  const store = newStore();
  const runId = seedRun(store);

  // Regression: the render path once gated on the raw detected list. A waived
  // finding is re-detected on every render, so that bounced the run back to
  // review forever and no waiver could ever take effect.
  assert.equal(store.syncAndCountOpenBlocking(runId, [expansion], "worker:1"), 1);

  const issue = store.listIssues(runId)[0]!;
  store.waiveIssue({
    issueId: issue.id,
    expectedFindingFingerprint: issue.findingFingerprint,
    reviewerName: "sheen",
    note: "reviewed and accurate",
  });

  // The detector still emits it — the count must now be zero regardless.
  assert.equal(store.syncAndCountOpenBlocking(runId, [expansion], "worker:1"), 0);
  assert.equal(store.syncAndCountOpenBlocking(runId, [expansion], "worker:1"), 0);
  store.close();
});

test("syncAndCountOpenBlocking counts a newly changed finding as blocking again", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncAndCountOpenBlocking(runId, [bulletCount(6)], "worker:1");
  const issue = store.listIssues(runId)[0]!;
  store.waiveIssue({
    issueId: issue.id,
    expectedFindingFingerprint: issue.findingFingerprint,
    reviewerName: "s",
    note: "six is fine",
  });
  assert.equal(store.syncAndCountOpenBlocking(runId, [bulletCount(6)], "worker:1"), 0);

  // A different finding at the same location reopens, so it blocks again.
  assert.equal(store.syncAndCountOpenBlocking(runId, [bulletCount(9)], "worker:1"), 1);
  store.close();
});

test("warning-severity issues never gate a transition", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(
    runId,
    [
      { ...expansion, severity: "warning", code: "missing_field" },
      { ...bulletCount(6), severity: "warning", code: "quality_warning" },
    ],
    "worker:1"
  );

  assert.equal(store.listIssues(runId).length, 2);
  assert.equal(store.countOpenBlocking(runId), 0);
  store.close();
});

test("severity escalation on a changed finding is reflected", () => {
  const store = newStore();
  const runId = seedRun(store);

  store.syncIssues(runId, [{ ...bulletCount(6), severity: "warning" }], "worker:1");
  assert.equal(store.countOpenBlocking(runId), 0);

  store.syncIssues(runId, [{ ...bulletCount(9), severity: "blocking" }], "worker:1");
  assert.equal(store.listIssues(runId)[0]!.severity, "blocking");
  assert.equal(store.countOpenBlocking(runId), 1);
  store.close();
});
