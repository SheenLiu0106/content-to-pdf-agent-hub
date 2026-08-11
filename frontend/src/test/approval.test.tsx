import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RunDetail from "../components/runs/RunDetail";
import {
  ARTIFACT_SHA,
  conflict,
  FINGERPRINT,
  installFetch,
  makeDetail,
  type FetchCall,
  type MockResponse,
} from "./fixtures";

function Harness() {
  const [reviewerName, setReviewerName] = useState("Dana");
  return (
    <RunDetail
      runId="run-1"
      reviewerName={reviewerName}
      onReviewerNameChange={setReviewerName}
      onBack={() => {}}
      onRunChanged={() => {}}
    />
  );
}

const APPROVAL_DETAIL = makeDetail({
  run: { status: "APPROVAL", renderAttempts: 1, qa: { verdict: "pass", checks: [] } },
  renderedFingerprint: FINGERPRINT,
  artifactSha256: ARTIFACT_SHA,
  hasArtifact: true,
});

const PREVIEW_TITLE = "Rendered PDF preview for acme-story.md";

describe("final approval workspace", () => {
  it("embeds the PDF preview and shows the artifact provenance", async () => {
    installFetch(() => ({ json: APPROVAL_DETAIL }));
    render(<Harness />);

    const frame = await screen.findByTitle(PREVIEW_TITLE);
    expect(frame).toBeInstanceOf(HTMLIFrameElement);
    // Previewed from a blob URL — the route sends Content-Disposition: attachment.
    expect(frame.getAttribute("src")).toMatch(/^blob:/);

    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute(
      "href",
      "/api/runs/run-1/pdf"
    );
    expect(screen.getAllByText(/Artifact SHA-256/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/rendered fingerprint matches the current content/i)
    ).toBeInTheDocument();
  });

  it("does not offer content or configuration editing", async () => {
    installFetch(() => ({ json: APPROVAL_DETAIL }));
    render(<Harness />);

    await screen.findByTitle(PREVIEW_TITLE);
    expect(screen.queryByRole("button", { name: /save content/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/render configuration/i)).not.toBeInTheDocument();
  });

  it("sends the current fingerprint and artifact hash on final approval", async () => {
    const { patches } = installFetch((call: FetchCall) =>
      call.method === "PATCH"
        ? { json: { approved: "final", artifactSha256: ARTIFACT_SHA } }
        : { json: APPROVAL_DETAIL }
    );
    render(<Harness />);

    await userEvent.click(await screen.findByRole("button", { name: "Approve final PDF" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm final approval" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({
      action: "approve_gate",
      gate: "approval",
      reviewerName: "Dana",
      expectedFingerprint: FINGERPRINT,
      expectedArtifactSha256: ARTIFACT_SHA,
    });
  });

  it("blocks approval when the content moved after the render", async () => {
    installFetch(() => ({
      json: makeDetail({
        run: { status: "APPROVAL" },
        renderedFingerprint: "fp-older-0000",
        currentFingerprint: FINGERPRINT,
        artifactSha256: ARTIFACT_SHA,
        hasArtifact: true,
      }),
    }));
    render(<Harness />);

    expect(await screen.findByRole("button", { name: "Approve final PDF" })).toBeDisabled();
    expect(screen.getByText(/this pdf is out of date/i)).toBeInTheDocument();
  });

  it("reports a missing artifact instead of an empty preview", async () => {
    installFetch((call: FetchCall) =>
      call.url.endsWith("/pdf")
        ? { status: 404, json: { error: "no_artifact", message: "no artifact" } }
        : { json: { ...APPROVAL_DETAIL, hasArtifact: true } }
    );
    render(<Harness />);

    expect(await screen.findByText(/no active rendered pdf/i)).toBeInTheDocument();
    expect(screen.queryByTitle(PREVIEW_TITLE)).not.toBeInTheDocument();
  });

  it("reloads the run and explains a 409 without retrying", async () => {
    let patchCount = 0;
    const { calls, patches } = installFetch((call: FetchCall): MockResponse => {
      if (call.method === "PATCH") {
        patchCount += 1;
        return conflict(
          "fingerprint_mismatch",
          "The artifact changed since you loaded it. Reload before approving.",
          { currentArtifactSha256: "sha-artifact-0002" }
        );
      }
      return { json: APPROVAL_DETAIL };
    });
    render(<Harness />);

    await userEvent.click(await screen.findByRole("button", { name: "Approve final PDF" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm final approval" }));

    expect(await screen.findByText(/changed since you opened it/i)).toBeInTheDocument();
    expect(screen.getByText(/review it again before approving/i)).toBeInTheDocument();

    // Exactly one attempt — a 409 must never be retried automatically…
    expect(patchCount).toBe(1);
    expect(patches()).toHaveLength(1);

    // …and the run is reloaded after the conflict.
    const patchIndex = calls.findIndex((c) => c.method === "PATCH");
    expect(
      calls.slice(patchIndex + 1).some((c) => c.method === "GET" && c.url === "/api/runs/run-1")
    ).toBe(true);
  });

  it("returns to the review workspace after request_changes", async () => {
    let requested = false;
    const { patches } = installFetch((call: FetchCall): MockResponse => {
      if (call.method === "PATCH") {
        requested = true;
        return { json: { requestedChanges: true } };
      }
      // After the decision the server reports REVIEW with no active artifact.
      return {
        json: requested
          ? makeDetail({
              run: { status: "REVIEW", qa: null },
              renderedFingerprint: null,
              artifactSha256: null,
              hasArtifact: false,
            })
          : APPROVAL_DETAIL,
      };
    });
    render(<Harness />);

    await screen.findByTitle(PREVIEW_TITLE);

    await userEvent.type(
      screen.getByLabelText(/what needs to change/i),
      "Fix the results figures."
    );
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm request changes" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({
      action: "request_changes",
      reviewerName: "Dana",
      note: "Fix the results figures.",
    });

    // Back at the review gate…
    expect(await screen.findByRole("button", { name: "Approve review" })).toBeInTheDocument();
    expect(screen.getByText(/waiting for a reviewer/i)).toBeInTheDocument();
    // …and the invalidated artifact is no longer presented as active.
    expect(screen.queryByTitle(PREVIEW_TITLE)).not.toBeInTheDocument();
  });
});
