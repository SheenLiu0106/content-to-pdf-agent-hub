import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../App";
import { installFetch, makeSummary } from "./fixtures";

const PASTE_PLACEHOLDER = /paste a customer story/i;

describe("top-level view switch", () => {
  beforeEach(() => {
    installFetch(() => ({ json: { runs: [makeSummary()] } }));
  });

  it("opens on the production workbench", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /production runs/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(PASTE_PLACEHOLDER)).not.toBeInTheDocument();
  });

  it("keeps the existing single-document Create workflow reachable", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("heading", { name: /create with ai/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(PASTE_PLACEHOLDER)).toBeInTheDocument();

    // …and back again, without losing either view.
    await userEvent.click(screen.getByRole("button", { name: "Runs" }));
    expect(
      await screen.findByRole("heading", { name: /production runs/i })
    ).toBeInTheDocument();
  });
});
