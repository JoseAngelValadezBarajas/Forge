import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { ProjectPlanningHome } from "./ProjectPlanningHome";

const workspace = {
  id: "workspace-1",
  name: "Local Workspace",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const project = {
  id: "project-1",
  name: "Forge",
};

function response(payload: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProjectPlanningHome", () => {
  it("shows real planning counts, pending work and parent Epic links", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/planning/overview")) {
        return response({
          epics: 2,
          features: 2,
          tasks: 3,
          acceptance_criteria: 1,
          satisfied_criteria: 1,
          dependencies: 1,
        });
      }
      if (url.endsWith("/epics")) {
        return response([
          {
            id: "epic-1",
            project_id: "project-1",
            title: "Product clarity",
            description: null,
            status: "planning",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]);
      }
      if (url.includes("/features")) {
        return response([
          {
            id: "feature-1",
            key: "FEAT-001",
            readable_id: "FEAT-001",
            project_id: "project-1",
            epic_id: "epic-1",
            title: "Navigation clarity",
            description: null,
            goal: null,
            priority: "high",
            status: "backlog",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "feature-2",
            key: "FEAT-002",
            readable_id: "FEAT-002",
            project_id: "project-1",
            epic_id: null,
            title: "Finished planning",
            description: null,
            goal: null,
            priority: "low",
            status: "done",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]);
      }
      if (url.includes("/decisions")) return response([]);
      if (url.includes("/invariants")) return response([]);
      return response([]);
    });

    render(
      <MemoryRouter>
        <ProjectPlanningHome project={project} workspace={workspace} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /Por .*nde continuar/ })).toBeInTheDocument();
    expect(screen.getByText(/FEAT-001 .* Navigation clarity/)).toBeInTheDocument();
    expect(screen.getByText(/Epic: Product clarity/)).toBeInTheDocument();
    expect(screen.queryByText(/FEAT-002 .* Finished planning/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all features" })).toHaveAttribute(
      "href",
      "/projects/project-1/features",
    );
    expect(screen.getByRole("link", { name: "Open board" })).toHaveAttribute(
      "href",
      "/projects/project-1/board",
    );
    expect(screen.getAllByText("2").some((node) =>
      node.className.includes("planning-home-metric-value"),
    )).toBe(true);
  });
});
