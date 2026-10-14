import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

const workspace = { id: "ws-1", name: "Local Workspace", description: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
const project = { id: "project-1", workspace_id: "ws-1", name: "Forge", description: "Planning", status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", archived_at: null };
const feature = { id: "feature-1", key: "FEAT-001", readable_id: "FEAT-001", project_id: "project-1", epic_id: null, title: "Workspace planning", description: "Plan the slice", goal: null, priority: "high", status: "backlog", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };

function response(payload: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }));
}

describe("FND-02 planning views", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/projects/project-1/board");
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/workspaces") && !init?.method) return response([workspace]);
      if (url.endsWith("/workspaces/ws-1/projects/project-1") && !init?.method) return response(project);
      if (url.includes("/planning/overview")) return response({ epics: 0, features: 1, tasks: 0, acceptance_criteria: 0, satisfied_criteria: 0, dependencies: 0 });
      if (url.includes("/epics")) return response([]);
      if (url.includes("/features") && !url.includes("/tasks") && !url.includes("acceptance-criteria")) return response([feature]);
      if (url.includes("/dependencies")) return response([]);
      if (url.includes("/tasks")) return response([]);
      if (url.includes("/acceptance-criteria")) return response([]);
      return response([]);
    });
  });

  it("renders a persisted feature on the board and keeps the manual-state disclaimer visible", async () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(await screen.findByRole("heading", { name: "Project Board" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Workspace planning" })).toBeInTheDocument();
    expect(screen.getByText(/Manual planning state only/)).toBeInTheDocument();
  });

  it("opens the feature form without claiming verification evidence", async () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    await screen.findByRole("heading", { name: "Project Board" });
    fireEvent.click(screen.getByRole("button", { name: "+ Feature" }));
    expect(screen.getByRole("heading", { name: "Create feature" })).toBeInTheDocument();
    expect(screen.getByText(/Manual planning state only/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("CI passed")).not.toBeInTheDocument());
  });
});
