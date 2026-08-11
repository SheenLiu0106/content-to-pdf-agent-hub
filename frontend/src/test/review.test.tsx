import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RunDetail from "../components/runs/RunDetail";
import type { RunDetail as RunDetailPayload } from "../lib/api";
import {
  FINGERPRINT,
  installFetch,
  makeDetail,
  makeIssue,
  type FetchCall,
  type MockResponse,
} from "./fixtures";

function Harness({ runId = "run-1" }: { runId?: string }) {
  const [reviewerName, setReviewerName] = useState("Dana");
  return (
    <RunDetail
      runId={runId}
      reviewerName={reviewerName}
      onReviewerNameChange={setReviewerName}
      onBack={() => {}}
      onRunChanged={() => {}}
    />
  );
}

function setup(
  detail: RunDetailPayload,
  onPatch: (call: FetchCall) => MockResponse = () => ({ json: { status: detail.run.status } })
) {
  const harness = installFetch((call) =>
    call.method === "PATCH" ? onPatch(call) : { json: detail }
  );
  render(<Harness />);
  return harness;
}

const BLOCKING = makeIssue({
  id: "issue-77",
  findingFingerprint: "ff-77",
  message: "Solutions must contain exactly 4 bullets.",
});

describe("review workspace", () => {
  it("displays open blocking issues", async () => {
    setup(makeDetail({ issues: [BLOCKING], openBlockingCount: 1 }));

    expect(
      await screen.findByText("Solutions must contain exactly 4 bullets.")
    ).toBeInTheDocument();
    expect(screen.getByText("Blocking")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(
      screen.getByText(/1 blocking issue must be resolved or waived before this run can proceed/i)
    ).toBeInTheDocument();

    // The locator is readable; the raw coordinate is present but secondary.
    expect(screen.getByText(/Summary · Solutions · Bullet count exact/)).toBeInTheDocument();
    expect(
      screen.getByText("summary.solutions.bullet_count_exact")
    ).toBeInTheDocument();
    expect(screen.getByText("render_validation")).toBeInTheDocument();
  });

  it("disables review approval while a blocking issue is open", async () => {
    setup(makeDetail({ issues: [BLOCKING], openBlockingCount: 1 }));

    const approve = await screen.findByRole("button", { name: "Approve review" });
    expect(approve).toBeDisabled();
    expect(
      screen.getByText(/1 blocking issue must be resolved or waived before this run can be approved/i)
    ).toBeInTheDocument();
  });

  it("sends issueId and expectedFindingFingerprint when waiving", async () => {
    const { patches } = setup(makeDetail({ issues: [BLOCKING], openBlockingCount: 1 }), () => ({
      json: { waived: "issue-77" },
    }));

    await userEvent.click(await screen.findByRole("button", { name: /^Waive issue:/i }));
    await userEvent.type(
      screen.getByLabelText(/reason for waiving/i),
      "Source genuinely lists three solutions."
    );
    await userEvent.click(screen.getByRole("button", { name: "Waive this issue" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm waive" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({
      action: "waive_issue",
      issueId: "issue-77",
      expectedFindingFingerprint: "ff-77",
      reviewerName: "Dana",
      note: "Source genuinely lists three solutions.",
    });
  });

  it("requires a reason before a waiver can be confirmed", async () => {
    const { patches } = setup(makeDetail({ issues: [BLOCKING], openBlockingCount: 1 }));

    await userEvent.click(await screen.findByRole("button", { name: /^Waive issue:/i }));
    await userEvent.click(screen.getByRole("button", { name: "Waive this issue" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/reason is required/i);
    expect(screen.queryByRole("button", { name: "Confirm waive" })).not.toBeInTheDocument();
    expect(patches()).toHaveLength(0);
  });

  it("sends the current fingerprint when approving the review gate", async () => {
    const { patches } = setup(makeDetail(), () => ({ json: { approved: "review" } }));

    await userEvent.click(await screen.findByRole("button", { name: "Approve review" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm approve review" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({
      action: "approve_gate",
      gate: "review",
      reviewerName: "Dana",
      expectedFingerprint: FINGERPRINT,
    });
  });

  it("sends a reject action with the required note", async () => {
    const { patches } = setup(makeDetail(), () => ({ json: { rejected: true } }));

    await screen.findByRole("button", { name: "Reject run" });
    await userEvent.type(screen.getByLabelText(/reason for rejection/i), "Off-brand claims.");
    await userEvent.click(screen.getByRole("button", { name: "Reject run" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm reject" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({
      action: "reject",
      reviewerName: "Dana",
      note: "Off-brand claims.",
    });
  });

  it("sends pause and hides retry outside FAILED", async () => {
    const { patches } = setup(makeDetail(), () => ({ json: { paused: true } }));

    await userEvent.click(await screen.findByRole("button", { name: /pause agent/i }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ action: "pause" });
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("sends resume for a paused run", async () => {
    const { patches } = setup(makeDetail({ run: { paused: true } }), () => ({
      json: { paused: false },
    }));

    await userEvent.click(await screen.findByRole("button", { name: /resume agent/i }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ action: "resume" });
  });

  it("offers retry only for a failed run", async () => {
    const { patches } = setup(
      makeDetail({
        run: {
          status: "FAILED",
          lastError: "Provider timed out.",
          lastErrorStage: "extract",
        },
      }),
      () => ({ json: { retryingAt: "QUEUED" } })
    );

    expect(await screen.findByText("Provider timed out.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ action: "retry" });
  });

  it("prevents a duplicate submission of the same decision", async () => {
    let release: (value: MockResponse) => void = () => {};
    const pending = new Promise<MockResponse>((resolve) => {
      release = resolve;
    });

    const { patches } = installFetch((call) =>
      call.method === "PATCH" ? pending : { json: makeDetail() }
    );
    render(<Harness />);

    await userEvent.click(await screen.findByRole("button", { name: "Approve review" }));
    const confirm = screen.getByRole("button", { name: "Confirm approve review" });

    // Two clicks with no await between them: the synchronous in-flight guard, not
    // a re-render, is what has to stop the second one.
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(patches()).toHaveLength(1);

    release({ json: { approved: "review" } });
    await waitFor(() => expect(patches()).toHaveLength(1));
  });
});
