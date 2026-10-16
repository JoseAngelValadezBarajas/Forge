import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InvariantsPage } from "./index";

const workspace = {
  id: "workspace-1",
  name: "Local Workspace",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const invariant = {
  id: "invariant-1",
  project_id: "project-1",
  feature_id: null,
  title: "Preserve immutable history",
  statement: "Published records remain unchanged.",
  rationale: "Review requires stable provenance.",
  status: "active",
  revision: 2,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

function response(payload: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }));
}

describe("Invariants feature error recovery", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("recovers from a failed load and renders the current invariant", async () => {
    let invariantAttempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/invariants?include_retired=true")) {
        invariantAttempts += 1;
        return invariantAttempts === 1
          ? response({ detail: "Temporary local database failure." }, 503)
          : response([invariant]);
      }
      if (url.endsWith("/features")) return response([]);
      return response([]);
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/invariants"]}>
        <Routes>
          <Route
            element={<InvariantsPage onOpenPalette={() => undefined} workspace={workspace} />}
            path="/projects/:projectId/invariants"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Temporary local database failure.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: invariant.title })).toBeInTheDocument();
    expect(screen.getByText(invariant.statement)).toBeInTheDocument();
    expect(invariantAttempts).toBe(2);
  });
});
