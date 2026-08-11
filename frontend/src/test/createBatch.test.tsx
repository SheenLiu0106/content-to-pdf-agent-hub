import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RunsView from "../components/runs/RunsView";

/** RunsView takes the reviewer identity from App, so tests supply a stateful host. */
function RunsHost() {
  const [reviewer, setReviewer] = useState("Dana");
  return (
    <RunsView
      view="runs"
      onViewChange={() => {}}
      reviewerName={reviewer}
      onReviewerNameChange={setReviewer}
    />
  );
}
import { installFetch, type FetchCall } from "./fixtures";

const ONE = "Acme replaced a manual onboarding process with an automated workflow.";
const TWO = "Beta cut its month-end close from ten days to three using one workflow.";

function setup() {
  const harness = installFetch((call: FetchCall) => {
    if (call.method === "POST") {
      return {
        status: 201,
        json: {
          batchId: "batch-9",
          reviewPolicy: "only_when_flagged",
          approvalMode: "required",
          runs: [
            { id: "r1", name: "one.md", status: "QUEUED" },
            { id: "r2", name: "two.txt", status: "QUEUED" },
          ],
        },
      };
    }
    return { json: { runs: [] } };
  });
  render(<RunsHost />);
  return harness;
}

describe("create production batch", () => {
  it("sends one item per file plus the batch options", async () => {
    const { calls } = setup();

    await userEvent.click(await screen.findByRole("button", { name: /new production run/i }));

    await userEvent.upload(screen.getByLabelText(/source files/i), [
      new File([ONE], "one.md", { type: "text/markdown" }),
      new File([TWO], "two.txt", { type: "text/plain" }),
    ]);
    // Reading files is async — wait for the staged list before submitting.
    expect(await screen.findByText(/2 runs will be created/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/batch name/i), "Q3 stories");
    await userEvent.click(screen.getByRole("button", { name: /create batch/i }));

    const post = calls.find((c) => c.method === "POST" && c.url === "/api/runs");
    expect(post).toBeDefined();
    expect(post!.body.items).toEqual([
      { name: "one.md", rawContent: ONE },
      { name: "two.txt", rawContent: TWO },
    ]);
    expect(post!.body.options).toMatchObject({
      name: "Q3 stories",
      // The documented defaults.
      reviewPolicy: "only_when_flagged",
      approvalMode: "required",
    });
    expect(post!.body.options.config.templateId).toBe("usecase");

    // The created runs are shown, and the list refreshes.
    expect(await screen.findByText(/created 2 runs/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "one.md" })).toBeInTheDocument();
  });

  it("skips a too-short file without blocking the rest", async () => {
    const { calls } = setup();

    await userEvent.click(await screen.findByRole("button", { name: /new production run/i }));

    await userEvent.upload(screen.getByLabelText(/source files/i), [
      new File([ONE], "one.md", { type: "text/markdown" }),
      new File(["too short"], "short.md", { type: "text/markdown" }),
    ]);

    expect(await screen.findByText(/1 run will be created/i)).toBeInTheDocument();
    expect(screen.getByText(/needs at least 20 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/1 file will be skipped/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /create batch/i }));

    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body.items).toEqual([{ name: "one.md", rawContent: ONE }]);
  });

  it("rejects an unsupported extension that bypasses the picker filter", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /new production run/i }));

    // userEvent.upload honours the accept attribute, so a .pdf never reaches the
    // handler through it. The extension check is a trust boundary and must hold
    // for drag-drop too — drive the change event directly to prove it does.
    const input = screen.getByLabelText(/source files/i);
    Object.defineProperty(input, "files", {
      value: [new File(["ignored binary payload here"], "notes.pdf", { type: "application/pdf" })],
      configurable: true,
    });
    fireEvent.change(input);

    expect(
      await screen.findByText(/only \.txt and \.md files are supported/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create batch/i })).toBeDisabled();
  });

  it("cannot submit with no readable files", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /new production run/i }));

    expect(screen.getByRole("button", { name: /create batch/i })).toBeDisabled();
  });
});
