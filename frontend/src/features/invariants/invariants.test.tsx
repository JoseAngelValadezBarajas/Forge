import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("rejects whitespace-only input and preserves a failed invariant draft for retry", async () => {
    let createAttempts = 0;
    let postedBody: Record<string, unknown> = {};
    let saved: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/invariants") && init?.method === "POST") {
        createAttempts += 1;
        postedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (createAttempts === 1)
          return response({ detail: "Invariant store is temporarily unavailable." }, 503);
        saved = [{ ...invariant, ...postedBody }];
        return response(saved[0], 201);
      }
      if (url.includes("/invariants?include_retired=true")) return response(saved);
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

    fireEvent.click(await screen.findByRole("button", { name: "+ New invariant" }));
    const form = screen.getByRole("heading", { name: "Create invariant" }).closest("form");
    if (!form) throw new Error("Invariant form was not rendered.");
    const submit = () => within(form).getByRole("button", { name: "Create invariant" });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByLabelText("Statement"), {
      target: { value: "A statement" },
    });
    fireEvent.change(screen.getByLabelText("Rationale"), {
      target: { value: "A rationale" },
    });
    fireEvent.click(submit());
    expect(
      await screen.findByText("Title, statement and rationale are required."),
    ).toBeInTheDocument();
    expect(createAttempts).toBe(0);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Preserve reviewed context" },
    });
    fireEvent.click(submit());
    expect(
      await screen.findByText("Could not save the invariant. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Statement")).toHaveValue("A statement");
    expect(screen.getByLabelText("Rationale")).toHaveValue("A rationale");

    fireEvent.click(submit());
    expect(
      await screen.findByRole("heading", {
        name: "Preserve reviewed context",
      }),
    ).toBeInTheDocument();
    expect(createAttempts).toBe(2);
    expect(postedBody).toEqual({
      title: "Preserve reviewed context",
      statement: "A statement",
      rationale: "A rationale",
    });
  });
});
