import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";

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
import { installFetch, makeSummary } from "./fixtures";

function renderList() {
  return render(<RunsHost />);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("runs list", () => {
  it("displays the records returned by GET /api/runs", async () => {
    installFetch(() => ({
      json: {
        runs: [
          makeSummary({
            id: "run-1",
            name: "acme-story.md",
            status: "REVIEW",
            openBlockingCount: 2,
            extractAttempts: 1,
            renderAttempts: 0,
          }),
          makeSummary({
            id: "run-2",
            name: "beta-memo.md",
            status: "RENDERING",
            paused: true,
            extractAttempts: 2,
            renderAttempts: 3,
          }),
        ],
      },
    }));

    renderList();

    // Scoped to the table: the status filter renders every label as an <option>.
    const table = within(await screen.findByRole("table"));

    expect(table.getByText("acme-story.md")).toBeInTheDocument();
    expect(table.getByText("beta-memo.md")).toBeInTheDocument();
    expect(table.getByText("Needs review")).toBeInTheDocument();
    expect(table.getByText("Rendering")).toBeInTheDocument();
    expect(table.getByText("2 open")).toBeInTheDocument();
    expect(table.getAllByText("batch-ab…")).toHaveLength(2);

    // Paused is a badge of its own, never folded into the status.
    expect(table.getByText("Paused")).toBeInTheDocument();

    const pausedRow = table.getByText("beta-memo.md").closest("tr")!;
    expect(within(pausedRow).getByText("2")).toBeInTheDocument();
    expect(within(pausedRow).getByText("3")).toBeInTheDocument();

    // One keyboard-reachable Open control per run — rows are not buttons.
    expect(table.getAllByRole("button", { name: /^Open run /i })).toHaveLength(2);
  });

  it("shows the empty state when there are no runs", async () => {
    installFetch(() => ({ json: { runs: [] } }));
    renderList();

    expect(await screen.findByText(/no production runs yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an API error state with a retry", async () => {
    installFetch(() => ({
      status: 500,
      json: { error: "boom", message: "The run store is unavailable." },
    }));
    renderList();

    expect(await screen.findByText("The run store is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("stops polling once every run is terminal or failed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = installFetch(() => ({
      json: {
        runs: [
          makeSummary({ id: "a", status: "APPROVED" }),
          makeSummary({ id: "b", status: "REJECTED" }),
          makeSummary({ id: "c", status: "FAILED" }),
        ],
      },
    }));

    renderList();
    await screen.findByRole("table");
    const afterFirstLoad = calls.length;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(calls.length).toBe(afterFirstLoad);
  });

  it("does not poll runs sitting at a human gate", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = installFetch(() => ({
      json: {
        runs: [
          makeSummary({ id: "a", status: "REVIEW" }),
          makeSummary({ id: "b", status: "APPROVAL" }),
        ],
      },
    }));

    renderList();
    await screen.findByRole("table");
    const afterFirstLoad = calls.length;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(calls.length).toBe(afterFirstLoad);
  });

  it("keeps polling while the agent is still working", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = installFetch(() => ({
      json: { runs: [makeSummary({ id: "a", status: "EXTRACTING" })] },
    }));

    renderList();
    await screen.findByRole("table");
    const afterFirstLoad = calls.length;

    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls.length).toBeGreaterThan(afterFirstLoad);
  });

  it("keeps polling an in-flight render even when a pause was requested", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = installFetch(() => ({
      json: { runs: [makeSummary({ id: "a", status: "RENDERING", paused: true })] },
    }));

    renderList();
    await screen.findByRole("table");
    const afterFirstLoad = calls.length;

    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls.length).toBeGreaterThan(afterFirstLoad);
  });

  it("does not poll a paused run waiting to be claimed for render", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = installFetch(() => ({
      json: { runs: [makeSummary({ id: "a", status: "READY_TO_RENDER", paused: true })] },
    }));

    renderList();
    await screen.findByRole("table");
    const afterFirstLoad = calls.length;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(calls.length).toBe(afterFirstLoad);
  });
});
