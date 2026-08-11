import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ContentToPdfPage from "../pages/ContentToPdfPage";
import RunsView from "../components/runs/RunsView";
import type { AppView } from "../components/shell/SideNav";
import { installFetch, TEST_AGENT, TEST_CONTENT } from "./fixtures";
import { TEMPLATE_DEFINITIONS } from "../lib/templates";

/** Mirrors App: Create and Runs are sibling views over one reviewer identity. */
function CreateHost() {
  const [view, setView] = useState<AppView>("create");
  const [reviewer, setReviewer] = useState("Dana");
  const shared = {
    view,
    onViewChange: setView,
    reviewerName: reviewer,
    onReviewerNameChange: setReviewer,
  };
  return view === "create" ? <ContentToPdfPage {...shared} /> : <RunsView {...shared} />;
}

const EXTRACT_RESPONSE = {
  content: TEST_CONTENT,
  intake: TEST_AGENT.intake,
  strategy: TEST_AGENT.strategy,
  layoutPlan: TEST_AGENT.layoutPlan,
  warnings: TEST_AGENT.warnings,
  recommendedTemplate: TEST_AGENT.recommendedTemplate,
  availableTemplates: TEMPLATE_DEFINITIONS,
};

const SOURCE =
  "Acme replaced a manual onboarding process with an automated workflow last quarter, " +
  "shortening ramp-up and reducing administrative errors across the organization.";

const PRIMARY = /analyze and create draft/i;

describe("Create — run intake", () => {
  it("opens on intake with no document preview and no Generate PDF action", () => {
    installFetch(() => ({ json: {} }));
    const { container } = render(<CreateHost />);

    expect(screen.getByRole("heading", { name: /create with ai/i })).toBeInTheDocument();
    // Requirement 1: nothing document-shaped exists before extraction.
    expect(container.querySelector(".paper")).toBeNull();
    expect(screen.queryByText(/your document will appear here/i)).not.toBeInTheDocument();
    // Requirement 8: the early primary action is analysis, not PDF generation.
    expect(screen.queryByRole("button", { name: /generate pdf/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: PRIMARY })).toBeInTheDocument();
  });

  it("keeps the source input accessible and reports character count", async () => {
    installFetch(() => ({ json: {} }));
    render(<CreateHost />);

    const box = screen.getByLabelText(/source content/i);
    expect(box).toBeInTheDocument();
    await userEvent.type(box, "Hello");
    expect(screen.getByText(/5 \/ 50,000 characters/i)).toBeInTheDocument();
  });

  it("disables the primary action until there is enough source content", async () => {
    installFetch(() => ({ json: {} }));
    render(<CreateHost />);

    expect(screen.getByRole("button", { name: PRIMARY })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/source content/i), SOURCE);
    expect(screen.getByRole("button", { name: PRIMARY })).toBeEnabled();
  });

  it("selects a template", async () => {
    installFetch(() => ({ json: {} }));
    render(<CreateHost />);

    const caseStudy = screen.getByRole("button", { name: /customer case study/i });
    const article = screen.getByRole("button", { name: /article report/i });
    expect(caseStudy).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(article);
    expect(article).toHaveAttribute("aria-pressed", "true");
    expect(caseStudy).toHaveAttribute("aria-pressed", "false");
  });

  it("expands and collapses brand settings", async () => {
    installFetch(() => ({ json: {} }));
    render(<CreateHost />);

    const summary = screen.getByText(/brand and assets/i);
    const group = summary.closest("details") as HTMLDetailsElement;

    // Collapsed by default: the brand fields are present but not shown.
    expect(group.open).toBe(false);
    expect(screen.getByLabelText(/^brand name$/i)).not.toBeVisible();

    await userEvent.click(summary);
    expect(group.open).toBe(true);
    expect(screen.getByLabelText(/^brand name$/i)).toBeVisible();

    await userEvent.click(summary);
    expect(group.open).toBe(false);
  });

  it("submits the existing extraction action and opens the draft review", async () => {
    const { calls } = installFetch((c) =>
      c.url === "/api/extract" ? { json: EXTRACT_RESPONSE } : { json: {} }
    );
    const { container } = render(<CreateHost />);

    await userEvent.type(screen.getByLabelText(/source content/i), SOURCE);
    await userEvent.click(screen.getByRole("button", { name: PRIMARY }));

    // Requirement 5: the existing /api/extract endpoint, with the raw source.
    const post = calls.find((c) => c.url === "/api/extract");
    expect(post?.method).toBe("POST");
    expect(post?.body).toEqual({ rawContent: SOURCE });

    // Requirement 6: the document canvas appears only now that content exists.
    expect(
      await screen.findByRole("button", { name: /generate pdf/i })
    ).toBeInTheDocument();
    expect(container.querySelector(".paper")).not.toBeNull();
    expect(screen.queryByRole("button", { name: PRIMARY })).not.toBeInTheDocument();
  });

  it("shows a real progress state while extraction is in flight", async () => {
    let release!: (v: { json: unknown }) => void;
    const gate = new Promise<{ json: unknown }>((res) => {
      release = res;
    });
    installFetch((c) => (c.url === "/api/extract" ? gate : { json: {} }));
    render(<CreateHost />);

    await userEvent.type(screen.getByLabelText(/source content/i), SOURCE);
    await userEvent.click(screen.getByRole("button", { name: PRIMARY }));

    expect(await screen.findByText(/extraction in progress/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analysing/i })).toBeDisabled();

    release({ json: EXTRACT_RESPONSE });
    expect(await screen.findByRole("button", { name: /generate pdf/i })).toBeInTheDocument();
  });

  it("creates a batch from uploaded files and hands off to Runs", async () => {
    const { calls } = installFetch((c) => {
      if (c.method === "POST" && c.url === "/api/runs") {
        return {
          status: 201,
          json: {
            batchId: "batch-9",
            reviewPolicy: "only_when_flagged",
            approvalMode: "required",
            runs: [{ id: "r1", name: "one.md", status: "QUEUED" }],
          },
        };
      }
      return { json: { runs: [] } };
    });
    render(<CreateHost />);

    await userEvent.click(screen.getByRole("button", { name: /batch upload/i }));
    await userEvent.upload(
      screen.getByLabelText(/source files/i),
      new File([SOURCE], "one.md", { type: "text/markdown" })
    );
    expect(await screen.findByText("one.md", { selector: "strong" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: PRIMARY }));

    const post = calls.find((c) => c.method === "POST" && c.url === "/api/runs");
    expect(post?.body.items).toEqual([{ name: "one.md", rawContent: SOURCE }]);
    expect(post?.body.options).toMatchObject({
      reviewPolicy: "only_when_flagged",
      approvalMode: "required",
    });

    // Backend state owns the next screen: we land on the Runs workbench.
    expect(await screen.findByRole("heading", { name: /production runs/i })).toBeInTheDocument();
  });

  it("keeps keyboard access to the source field and the primary action", async () => {
    installFetch(() => ({ json: {} }));
    render(<CreateHost />);

    const box = screen.getByLabelText(/source content/i);
    box.focus();
    expect(box).toHaveFocus();

    // The primary action is correctly unfocusable while disabled; once there is source
    // content it takes focus like any button.
    await userEvent.type(box, SOURCE);
    const primary = screen.getByRole("button", { name: PRIMARY });
    primary.focus();
    expect(primary).toHaveFocus();

    // Disclosure and options are native elements, so keyboard operation comes from the
    // platform rather than from key handlers on divs.
    expect(screen.getByText(/brand and assets/i).closest("summary")).not.toBeNull();
    expect(screen.getByRole("button", { name: /article report/i }).tagName).toBe("BUTTON");
    expect(screen.getByLabelText(/source content/i).tagName).toBe("TEXTAREA");
  });

  it("marks automatic approval as unavailable", async () => {
    installFetch(() => ({ json: {} }));
    render(<CreateHost />);

    await userEvent.click(screen.getByText(/agent behaviour/i));
    const select = screen.getByLabelText(/approval mode/i);
    const auto = within(select).getByRole("option", { name: /auto-approve when clean/i });
    expect(auto).toBeDisabled();
  });
});
