import { describe, expect, it } from "vitest";

import {
  agentPhase,
  contentOrigins,
  describeStaleness,
  documentOrigin,
  explainIssue,
  retryConsequences,
  runStages,
} from "../lib/agentUx";
import type { ApiError } from "../lib/api";
import {
  FINGERPRINT,
  makeApproval,
  makeDetail,
  makeEvent,
  makeIssue,
  TEST_CONTENT,
} from "./fixtures";

/** The stage a run is reported as being at, and the one reported next. */
function positions(detail: ReturnType<typeof makeDetail>) {
  return runStages(detail).map((s) => `${s.key}:${s.state}`);
}

describe("agent phase wording", () => {
  it("names the actor for every status", () => {
    expect(agentPhase("EXTRACTING", false)).toEqual({
      kind: "agent",
      label: "Agent working",
    });
    expect(agentPhase("REVIEW", false)).toEqual({
      kind: "human",
      label: "Human decision required",
    });
    expect(agentPhase("APPROVAL", false)).toEqual({
      kind: "human",
      label: "Artifact ready for sign-off",
    });
    expect(agentPhase("APPROVED", false)).toEqual({
      kind: "approved",
      label: "Human approved",
    });
  });

  it("re-labels a pause only where the agent would otherwise act next", () => {
    expect(agentPhase("EXTRACTING", true).label).toBe("Agent paused for review");
    // At a human gate the decision is still what is being waited on.
    expect(agentPhase("REVIEW", true).label).toBe("Human decision required");
  });
});

describe("run stages", () => {
  it("reports the current and next stage from status alone", () => {
    expect(positions(makeDetail({ run: { status: "EXTRACTING" } }))).toEqual([
      "source:done",
      "extract:current",
      "review:next",
      "render:later",
      "approval:later",
    ]);
    expect(positions(makeDetail({ run: { status: "APPROVAL" } }))).toEqual([
      "source:done",
      "extract:done",
      "review:done",
      "render:done",
      "approval:current",
    ]);
  });

  it("places a failed run at the stage that actually failed", () => {
    const rendered = makeDetail({
      run: { status: "FAILED", lastErrorStage: "render" },
    });
    expect(positions(rendered)).toContain("render:current");
    const extracted = makeDetail({
      run: { status: "FAILED", lastErrorStage: "extract" },
    });
    expect(positions(extracted)).toContain("extract:current");
  });

  it("timestamps a stage only from a recorded event or approval", () => {
    const detail = makeDetail({
      run: { status: "REVIEW" },
      events: [
        makeEvent({ id: "e1", seq: 1, type: "claimed", toStatus: "EXTRACTING" }),
        makeEvent({
          id: "e2",
          seq: 2,
          type: "transition",
          fromStatus: "EXTRACTING",
          toStatus: "REVIEW",
          createdAt: "2026-08-01T10:04:00.000Z",
        }),
      ],
    });
    const byKey = Object.fromEntries(runStages(detail).map((s) => [s.key, s]));

    expect(byKey.extract.at).toBe("2026-08-01T10:04:00.000Z");
    // Nothing rendered and nothing approved, so no time is invented for either.
    expect(byKey.render.at).toBeUndefined();
    expect(byKey.approval.at).toBeUndefined();
  });

  it("takes the review timestamp from the approval record, not from a guess", () => {
    const detail = makeDetail({
      run: { status: "READY_TO_RENDER" },
      approvals: [makeApproval({ decidedAt: "2026-08-01T11:00:00.000Z" })],
    });
    const review = runStages(detail).find((s) => s.key === "review")!;
    expect(review.at).toBe("2026-08-01T11:00:00.000Z");
  });

  it("states the real review policy and the disabled auto-approval", () => {
    const always = runStages(makeDetail({ run: { reviewPolicy: "always" } }));
    expect(always.find((s) => s.key === "review")!.note).toMatch(/always stops here/i);

    const auto = runStages(makeDetail({ run: { approvalMode: "auto_if_clean" } }));
    expect(auto.find((s) => s.key === "approval")!.note).toMatch(/a human still signs/i);
  });
});

describe("content origin", () => {
  it("labels expansion notes and missing fields from the content itself", () => {
    const detail = makeDetail({
      run: {
        content: {
          ...TEST_CONTENT,
          expansionNotes: ["Added an industry benchmark not present in the source."],
          missingFields: ["customer quote"],
        },
      },
    });
    const items = contentOrigins(detail);

    expect(items).toEqual([
      {
        kind: "expansion",
        text: "Added an industry benchmark not present in the source.",
        locator: "expansionNotes.0",
        issue: undefined,
      },
      {
        kind: "unsupported",
        text: "Source did not supply: customer quote",
        locator: "missingFields.0",
        issue: undefined,
      },
    ]);
  });

  it("never claims a human approved content whose fingerprint moved", () => {
    const approved = makeDetail({
      approvals: [makeApproval({ contentFingerprint: FINGERPRINT })],
    });
    expect(documentOrigin(approved).humanApproved).toBe(true);

    const edited = makeDetail({
      approvals: [makeApproval({ contentFingerprint: "fp-older-0000" })],
    });
    expect(documentOrigin(edited).humanApproved).toBe(false);
  });

  it("counts open findings as needing review", () => {
    const detail = makeDetail({
      issues: [makeIssue()],
      openBlockingCount: 1,
    });
    expect(documentOrigin(detail).unsupported).toBe(1);
    expect(documentOrigin(detail).restructured).toBe(true);
  });
});

describe("issue explanation", () => {
  it("explains a source expansion without claiming the source backs it", () => {
    const explanation = explainIssue(makeIssue({ code: "source_expansion" }));
    expect(explanation.origin).toBe("expansion");
    expect(explanation.why).toMatch(/goes beyond your source/i);
    expect(explanation.why).toMatch(/nothing in this system verifies an added claim/i);
  });

  it("falls back truthfully on an unknown code", () => {
    const explanation = explainIssue(makeIssue({ code: "brand_new_detector" }));
    expect(explanation.why).toMatch(/blocking finding/i);
  });
});

describe("retry consequences", () => {
  it("distinguishes resuming a render from repeating extraction", () => {
    expect(retryConsequences("render")[0]).toMatch(/does not repeat extraction/i);
    expect(retryConsequences("extract")[0]).toMatch(/restarts extraction/i);
    expect(retryConsequences(null)[0]).toMatch(/restarts extraction/i);
  });
});

describe("staleness from a 409", () => {
  const conflictError = (error: string, detail?: unknown): ApiError => ({
    status: 409,
    error,
    message: "rejected",
    detail,
  });

  it("names what moved when the detail says", () => {
    expect(
      describeStaleness(conflictError("fingerprint_mismatch", { currentArtifactSha256: "sha-2" }))
    ).toMatch(/different PDF is now the active artifact/i);

    expect(
      describeStaleness(conflictError("fingerprint_mismatch", { currentFingerprint: "fp-2" }))
    ).toMatch(/content or configuration changed/i);

    expect(describeStaleness(conflictError("blocking_issues_open", { openBlocking: 2 }))).toMatch(
      /2 blocking findings became open again/i
    );

    expect(describeStaleness(conflictError("wrong_state", { status: "REJECTED" }))).toMatch(
      /“Rejected”/
    );
  });

  it("stays silent rather than guessing when the detail is absent", () => {
    expect(describeStaleness(conflictError("fingerprint_mismatch"))).toBeNull();
    expect(describeStaleness(conflictError("blocking_issues_open"))).toBeNull();
    expect(describeStaleness(conflictError("something_new"))).toBeNull();
  });
});
