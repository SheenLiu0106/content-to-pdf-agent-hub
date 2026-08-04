import assert from "node:assert/strict";
import test from "node:test";

import type { PdfQualityReport } from "../shared/agentTypes.js";
import { TEST_CONFIG, TEST_CONTENT } from "./fixtures.js";
import {
  ACTION_ALLOWED_IN,
  ALLOWED_TRANSITIONS,
  assertLegalTransition,
  buildQaReport,
  canApproveFinal,
  canApproveReviewGate,
  canAutoApprove,
  deriveIssues,
  isActionAllowed,
  isLegalTransition,
  nextAfterExtract,
  retryTarget,
  shouldRetry,
} from "./machine.js";
import { MAX_EXTRACT_ATTEMPTS, MAX_RENDER_ATTEMPTS } from "./store.js";
import { RUN_STATUSES, type Run, type RunAction, type RunStatus } from "./types.js";

const FP = "fp-current";
const SHA = "sha-artifact";

function makeRun(over: Partial<Run> = {}): Run {
  return {
    id: "r1",
    batchId: "b1",
    name: "doc.txt",
    status: "REVIEW",
    paused: false,
    reviewPolicy: "only_when_flagged",
    approvalMode: "required",
    rawContent: "raw",
    content: TEST_CONTENT,
    config: TEST_CONFIG,
    agent: null,
    qa: { verdict: "pass", checks: [] },
    pdfPath: null,
    renderedFingerprint: null,
    artifactSha256: null,
    extractAttempts: 0,
    renderAttempts: 0,
    nextAttemptAt: null,
    lastError: null,
    lastErrorStage: null,
    lockedAt: null,
    lockedBy: null,
    createdAt: "2026-08-03T12:00:00.000Z",
    updatedAt: "2026-08-03T12:00:00.000Z",
    ...over,
  };
}

/** A run sitting at APPROVAL with a consistent, verifiable artifact. */
function approvalRun(over: Partial<Run> = {}): Run {
  return makeRun({
    status: "APPROVAL",
    pdfPath: `/artifacts/r1/${SHA}.pdf`,
    artifactSha256: SHA,
    renderedFingerprint: FP,
    qa: { verdict: "pass", checks: [] },
    ...over,
  });
}

// ---------------------------------------------------------------------------
// legality table
// ---------------------------------------------------------------------------

test("every status has a legality entry", () => {
  for (const status of RUN_STATUSES) {
    assert.ok(
      ALLOWED_TRANSITIONS[status] !== undefined,
      `${status} missing from the legality table`
    );
  }
});

test("terminal states allow nothing except FAILED retry", () => {
  assert.deepEqual(ALLOWED_TRANSITIONS.APPROVED, []);
  assert.deepEqual(ALLOWED_TRANSITIONS.REJECTED, []);
  assert.deepEqual([...ALLOWED_TRANSITIONS.FAILED], ["QUEUED", "READY_TO_RENDER"]);
});

test("RENDERING cannot reach FAILED for correctable problems, only infrastructure", () => {
  // Both correctable routes exist...
  assert.ok(isLegalTransition("RENDERING", "REVIEW"));
  assert.ok(isLegalTransition("RENDERING", "READY_TO_RENDER"));
  // ...and FAILED remains reachable only for infrastructure exhaustion.
  assert.ok(isLegalTransition("RENDERING", "FAILED"));
});

test("gate and terminal states are never reachable from a sweep-style fallback", () => {
  // The sweep only produces EXTRACTING->QUEUED and RENDERING->READY_TO_RENDER.
  assert.ok(isLegalTransition("EXTRACTING", "QUEUED"));
  assert.ok(isLegalTransition("RENDERING", "READY_TO_RENDER"));
  assert.ok(!isLegalTransition("REVIEW", "QUEUED"));
  assert.ok(!isLegalTransition("APPROVAL", "READY_TO_RENDER"));
  assert.ok(!isLegalTransition("APPROVED", "REVIEW"));
});

test("illegal transitions are reported, not silently allowed", () => {
  const r = assertLegalTransition("QUEUED", "APPROVED");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "illegal_transition");
  assert.equal(assertLegalTransition("QUEUED", "EXTRACTING").ok, true);
});

test("no transition targets a status outside the known set", () => {
  const known = new Set<string>(RUN_STATUSES);
  for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
    for (const to of targets) {
      assert.ok(known.has(to), `${from} -> ${to} targets an unknown status`);
    }
  }
});

// ---------------------------------------------------------------------------
// post-extraction routing — the non-bypassable review rule
// ---------------------------------------------------------------------------

test("only_when_flagged skips review only when nothing blocking is open", () => {
  assert.equal(nextAfterExtract("only_when_flagged", 0), "READY_TO_RENDER");
  assert.equal(nextAfterExtract("only_when_flagged", 1), "REVIEW");
  assert.equal(nextAfterExtract("only_when_flagged", 7), "REVIEW");
});

test("always enters review even with a clean run", () => {
  assert.equal(nextAfterExtract("always", 0), "REVIEW");
  assert.equal(nextAfterExtract("always", 3), "REVIEW");
});

test("no policy value can skip review while a blocking issue is open", () => {
  for (const policy of ["only_when_flagged", "always"] as const) {
    assert.equal(nextAfterExtract(policy, 1), "REVIEW");
  }
});

// ---------------------------------------------------------------------------
// stage-specific retry
// ---------------------------------------------------------------------------

test("a render failure retries at READY_TO_RENDER, never re-extracting", () => {
  assert.equal(retryTarget("render"), "READY_TO_RENDER");
});

test("an extract failure retries at QUEUED", () => {
  assert.equal(retryTarget("extract"), "QUEUED");
  // Unknown stage defaults to the start, which is the safe fallback.
  assert.equal(retryTarget(null), "QUEUED");
});

test("retry budgets are tracked per stage", () => {
  const run = makeRun({ extractAttempts: MAX_EXTRACT_ATTEMPTS, renderAttempts: 0 });
  assert.equal(shouldRetry(run, "extract", true), false, "extract budget exhausted");
  assert.equal(shouldRetry(run, "render", true), true, "render budget untouched");

  const other = makeRun({ extractAttempts: 0, renderAttempts: MAX_RENDER_ATTEMPTS });
  assert.equal(shouldRetry(other, "render", true), false);
  assert.equal(shouldRetry(other, "extract", true), true);
});

test("a non-retryable failure is never retried regardless of budget", () => {
  const run = makeRun({ extractAttempts: 0 });
  assert.equal(shouldRetry(run, "extract", false), false);
});

// ---------------------------------------------------------------------------
// review gate guard
// ---------------------------------------------------------------------------

test("review approval succeeds on a clean, current draft", () => {
  const r = canApproveReviewGate({
    run: makeRun({ status: "REVIEW" }),
    openBlocking: 0,
    currentFingerprint: FP,
    expectedFingerprint: FP,
  });
  assert.equal(r.ok, true);
});

test("review approval is refused while a blocking issue is open", () => {
  const r = canApproveReviewGate({
    run: makeRun({ status: "REVIEW" }),
    openBlocking: 2,
    currentFingerprint: FP,
    expectedFingerprint: FP,
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "blocking_issues_open");
    assert.equal(r.detail?.openBlocking, 2);
  }
});

test("review approval is refused on a stale fingerprint", () => {
  const r = canApproveReviewGate({
    run: makeRun({ status: "REVIEW" }),
    openBlocking: 0,
    currentFingerprint: FP,
    expectedFingerprint: "stale",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "fingerprint_mismatch");
});

test("review approval is refused outside REVIEW", () => {
  const r = canApproveReviewGate({
    run: makeRun({ status: "APPROVAL" }),
    openBlocking: 0,
    currentFingerprint: FP,
    expectedFingerprint: FP,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "wrong_state");
});

// ---------------------------------------------------------------------------
// final approval guard
// ---------------------------------------------------------------------------

function finalCtx(over: Partial<Parameters<typeof canApproveFinal>[0]> = {}) {
  return {
    run: approvalRun(),
    openBlocking: 0,
    currentFingerprint: FP,
    expectedFingerprint: FP,
    expectedArtifactSha256: SHA,
    artifactOnDiskSha256: SHA,
    ...over,
  };
}

test("final approval succeeds when content, artifact and QA all agree", () => {
  assert.equal(canApproveFinal(finalCtx()).ok, true);
});

test("final approval is refused when the artifact file is gone", () => {
  const r = canApproveFinal(finalCtx({ artifactOnDiskSha256: null }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "artifact_missing");
});

test("final approval is refused when the file on disk does not match its hash", () => {
  // Corrupted or swapped bytes: existsSync would pass, re-hashing must not.
  const r = canApproveFinal(finalCtx({ artifactOnDiskSha256: "sha-of-corrupted-file" }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "artifact_mismatch");
});

test("final approval is refused on a stale expected artifact hash", () => {
  const r = canApproveFinal(finalCtx({ expectedArtifactSha256: "sha-the-client-saw-earlier" }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "fingerprint_mismatch");
});

test("final approval is refused when content changed since the render", () => {
  // Client is up to date, but the artifact was rendered from older content.
  const r = canApproveFinal(
    finalCtx({
      currentFingerprint: "fp-edited",
      expectedFingerprint: "fp-edited",
      run: approvalRun({ renderedFingerprint: "fp-at-render-time" }),
    })
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "artifact_fingerprint_stale");
});

test("final approval is refused when QA failed", () => {
  const r = canApproveFinal(
    finalCtx({ run: approvalRun({ qa: { verdict: "fail", checks: [] } }) })
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "qa_failed");
});

test("final approval tolerates a QA warning", () => {
  const r = canApproveFinal(
    finalCtx({ run: approvalRun({ qa: { verdict: "warn", checks: [] } }) })
  );
  assert.equal(r.ok, true);
});

test("final approval is refused while a blocking issue is open", () => {
  const r = canApproveFinal(finalCtx({ openBlocking: 1 }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "blocking_issues_open");
});

test("final approval is refused when there is no active artifact at all", () => {
  const r = canApproveFinal(
    finalCtx({
      run: approvalRun({ pdfPath: null, artifactSha256: null, renderedFingerprint: null }),
    })
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "artifact_missing");
});

// ---------------------------------------------------------------------------
// auto-approval stays off in Phase 1
// ---------------------------------------------------------------------------

test("auto-approval is disabled even when every other condition is perfect", () => {
  const r = canAutoApprove({
    run: approvalRun({ approvalMode: "auto_if_clean", qa: { verdict: "pass", checks: [] } }),
    openBlocking: 0,
    currentFingerprint: FP,
    artifactOnDiskSha256: SHA,
    renderQaEnabled: false,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "auto_approval_disabled");
});

test("auto-approval refuses a run whose mode requires a human, even once enabled", () => {
  const r = canAutoApprove({
    run: approvalRun({ approvalMode: "required" }),
    openBlocking: 0,
    currentFingerprint: FP,
    artifactOnDiskSha256: SHA,
    renderQaEnabled: true,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "auto_approval_disabled");
});

test("auto-approval requires a clean pass, not merely a non-failure", () => {
  const r = canAutoApprove({
    run: approvalRun({ approvalMode: "auto_if_clean", qa: { verdict: "warn", checks: [] } }),
    openBlocking: 0,
    currentFingerprint: FP,
    artifactOnDiskSha256: SHA,
    renderQaEnabled: true,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "qa_failed");
});

test("auto-approval applies every human-path artifact check", () => {
  const base = {
    run: approvalRun({ approvalMode: "auto_if_clean" }),
    openBlocking: 0,
    currentFingerprint: FP,
    renderQaEnabled: true,
  };
  assert.equal(canAutoApprove({ ...base, artifactOnDiskSha256: null }).ok, false);
  assert.equal(canAutoApprove({ ...base, artifactOnDiskSha256: "wrong" }).ok, false);
  assert.equal(
    canAutoApprove({ ...base, openBlocking: 1, artifactOnDiskSha256: SHA }).ok,
    false
  );
  // With the flag on and everything consistent, it would pass — proving the
  // Phase 1 block is the flag, not an unreachable guard.
  assert.equal(canAutoApprove({ ...base, artifactOnDiskSha256: SHA }).ok, true);
});

// ---------------------------------------------------------------------------
// action permissions
// ---------------------------------------------------------------------------

const UPDATE: RunAction = { action: "update_content", content: TEST_CONTENT };

test("content edits are confined to REVIEW", () => {
  assert.equal(isActionAllowed(UPDATE, makeRun({ status: "REVIEW" })).ok, true);
  for (const status of ["QUEUED", "EXTRACTING", "READY_TO_RENDER", "RENDERING",
                        "APPROVAL", "APPROVED", "REJECTED", "FAILED"] as RunStatus[]) {
    const r = isActionAllowed(UPDATE, makeRun({ status }));
    assert.equal(r.ok, false, `editing should be refused in ${status}`);
    if (!r.ok) assert.equal(r.code, "wrong_state");
  }
});

test("editing at APPROVAL points the caller at request_changes", () => {
  const r = isActionAllowed(UPDATE, makeRun({ status: "APPROVAL" }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /request_changes/);
});

test("approve_gate's gate must match the run's actual state", () => {
  const reviewGate: RunAction = {
    action: "approve_gate", gate: "review", reviewerName: "sheen", expectedFingerprint: FP,
  };
  const finalGate: RunAction = {
    action: "approve_gate", gate: "approval", reviewerName: "sheen",
    expectedFingerprint: FP, expectedArtifactSha256: SHA,
  };

  assert.equal(isActionAllowed(reviewGate, makeRun({ status: "REVIEW" })).ok, true);
  assert.equal(isActionAllowed(finalGate, makeRun({ status: "APPROVAL" })).ok, true);
  // Right action, wrong gate for the state.
  assert.equal(isActionAllowed(reviewGate, makeRun({ status: "APPROVAL" })).ok, false);
  assert.equal(isActionAllowed(finalGate, makeRun({ status: "REVIEW" })).ok, false);
});

test("request_changes is an APPROVAL-only action", () => {
  const action: RunAction = { action: "request_changes", reviewerName: "s", note: "n" };
  assert.equal(isActionAllowed(action, makeRun({ status: "APPROVAL" })).ok, true);
  assert.equal(isActionAllowed(action, makeRun({ status: "REVIEW" })).ok, false);
});

test("reject is available at both gates but nowhere else", () => {
  const action: RunAction = { action: "reject", reviewerName: "s", note: "n" };
  assert.equal(isActionAllowed(action, makeRun({ status: "REVIEW" })).ok, true);
  assert.equal(isActionAllowed(action, makeRun({ status: "APPROVAL" })).ok, true);
  assert.equal(isActionAllowed(action, makeRun({ status: "QUEUED" })).ok, false);
  assert.equal(isActionAllowed(action, makeRun({ status: "APPROVED" })).ok, false);
});

test("retry is only available from FAILED", () => {
  const action: RunAction = { action: "retry" };
  assert.equal(isActionAllowed(action, makeRun({ status: "FAILED" })).ok, true);
  assert.equal(isActionAllowed(action, makeRun({ status: "REVIEW" })).ok, false);
});

test("pause and resume work in every non-terminal state and no terminal one", () => {
  const pause: RunAction = { action: "pause" };
  for (const status of ["QUEUED", "EXTRACTING", "REVIEW", "READY_TO_RENDER",
                        "RENDERING", "APPROVAL"] as RunStatus[]) {
    assert.equal(isActionAllowed(pause, makeRun({ status })).ok, true, status);
  }
  for (const status of ["APPROVED", "REJECTED", "FAILED"] as RunStatus[]) {
    assert.equal(isActionAllowed(pause, makeRun({ status })).ok, false, status);
  }
});

test("waive_issue is confined to REVIEW", () => {
  const action: RunAction = {
    action: "waive_issue", issueId: "i1", expectedFindingFingerprint: "f",
    reviewerName: "s", note: "n",
  };
  assert.equal(isActionAllowed(action, makeRun({ status: "REVIEW" })).ok, true);
  assert.equal(isActionAllowed(action, makeRun({ status: "APPROVAL" })).ok, false);
});

test("every action has a permission entry", () => {
  const actions: RunAction["action"][] = [
    "update_content", "update_config", "pause", "resume", "waive_issue",
    "approve_gate", "request_changes", "reject", "retry",
  ];
  for (const a of actions) {
    assert.ok(ACTION_ALLOWED_IN[a], `${a} missing a permission entry`);
  }
});

// ---------------------------------------------------------------------------
// issue derivation
// ---------------------------------------------------------------------------

test("a conforming case study derives no blocking render_validation issues", () => {
  const issues = deriveIssues({ content: TEST_CONTENT, config: TEST_CONFIG });
  assert.deepEqual(issues.filter((i) => i.code === "render_validation"), []);
});

test("off-contract bullet counts derive blocking issues with structural locators", () => {
  const content = { ...TEST_CONTENT, solutions: ["only", "two"] };
  const issues = deriveIssues({ content, config: TEST_CONFIG });

  const rv = issues.filter((i) => i.code === "render_validation");
  assert.ok(rv.length >= 1);
  assert.ok(rv.every((i) => i.severity === "blocking"));

  const solutionIssue = rv.find((i) => i.locator.startsWith("summary.solutions"));
  assert.ok(solutionIssue, "should locate the offending section");
  // Locator is structural; the observed count rides in detail so a later change
  // at the same location produces a different finding fingerprint.
  assert.equal(solutionIssue!.locator, "summary.solutions.bullet_count_exact");
  assert.equal(solutionIssue!.detail, "observed=2");
});

test("expansion notes derive blocking source_expansion issues", () => {
  const content = {
    ...TEST_CONTENT,
    expansionNotes: ["Added industry context", "Smoothed a transition"],
  };
  const issues = deriveIssues({ content, config: TEST_CONFIG });
  const expansion = issues.filter((i) => i.code === "source_expansion");
  assert.equal(expansion.length, 2);
  assert.ok(expansion.every((i) => i.severity === "blocking"));
  assert.deepEqual(expansion.map((i) => i.locator), ["expansionNotes.0", "expansionNotes.1"]);
});

test("missing fields and intake risks are warnings, never blocking", () => {
  const content = { ...TEST_CONTENT, missingFields: ["customer name"] };
  const issues = deriveIssues({
    content,
    config: TEST_CONFIG,
    intakeRisks: ["source is very short"],
  });
  const soft = issues.filter((i) => i.code === "missing_field" || i.code === "intake_risk");
  assert.equal(soft.length, 2);
  assert.ok(soft.every((i) => i.severity === "warning"));
});

test("quality review errors are blocking and warnings are not", () => {
  const qualityReport: PdfQualityReport = {
    passed: false,
    issues: [
      { code: "summary_overflow_risk", severity: "error", message: "overflow", location: "page1" },
      { code: "sparse_page", severity: "warning", message: "sparse", location: "page2" },
    ],
  };
  const issues = deriveIssues({ content: TEST_CONTENT, config: TEST_CONFIG, qualityReport });

  const err = issues.find((i) => i.code === "quality_error");
  const warn = issues.find((i) => i.code === "quality_warning");
  assert.equal(err?.severity, "blocking");
  assert.equal(err?.locator, "quality.page1.summary_overflow_risk");
  assert.equal(warn?.severity, "warning");
});

test("derived issues are stable across repeated calls on identical input", () => {
  const content = { ...TEST_CONTENT, solutions: ["a"] };
  assert.deepEqual(
    deriveIssues({ content, config: TEST_CONFIG }),
    deriveIssues({ content, config: TEST_CONFIG })
  );
});

// ---------------------------------------------------------------------------
// QA report
// ---------------------------------------------------------------------------

test("a clean quality review yields a passing pre-render report", () => {
  const qa = buildQaReport({ passed: true, issues: [] });
  assert.equal(qa.verdict, "pass");
  assert.equal(qa.checks.length, 1);
  assert.equal(qa.checks[0]!.stage, "pre_render");
});

test("Phase 1 QA never emits fail or a render-stage check", () => {
  const qa = buildQaReport({
    passed: false,
    issues: [
      { code: "summary_overflow_risk", severity: "error", message: "m" },
      { code: "sparse_page", severity: "warning", message: "m" },
    ],
  });
  // Blocking severity is carried by the ISSUE, not by the artifact's QA verdict —
  // a pre-render heuristic must not condemn the output it never looked at.
  assert.equal(qa.verdict, "warn");
  assert.ok(qa.checks.every((c) => c.stage === "pre_render"));
  assert.ok(qa.checks.every((c) => c.verdict !== "fail"));
});

test("a null quality report still produces a well-formed report", () => {
  const qa = buildQaReport(null);
  assert.equal(qa.verdict, "pass");
  assert.equal(qa.checks.length, 1);
});
