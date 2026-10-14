import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeatureContextPage, RepositoriesPage } from "./fnd04";

const workspace = {
  id: "workspace-1",
  name: "Local Workspace",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const repository = {
  id: "repository-1",
  project_id: "project-1",
  root_path: "C:\\work\\forge",
  status: "connected" as const,
  connected_at: "2026-01-01T00:00:00Z",
  disconnected_at: null,
  last_observed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function response(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }));
}

describe("FND-04 repository and context surfaces", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("observes a connected local repository without presenting source data", async () => {
    const observe = { id: "observation-1", repository_id: repository.id, status: "ok" };
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/repositories") && !init?.method) return response([repository]);
      if (url.endsWith("/observe")) return response(observe);
      return response([]);
    });
    render(<MemoryRouter initialEntries={["/projects/project-1/repositories"]}><Routes><Route element={<RepositoriesPage onOpenPalette={() => undefined} workspace={workspace} />} path="/projects/:projectId/repositories" /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /forge/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Observe now" }));
    await waitFor(() => expect(screen.getByText("Connected · local only")).toBeInTheDocument());
    expect(screen.queryByText(/source/i)).not.toBeInTheDocument();
  });

  it("previews a deterministic context package without creating saved history", async () => {
    const packageData = {
      id: null,
      project_id: "project-1",
      feature_id: "feature-1",
      schema_version: "forge-context-v1",
      fingerprint: "a".repeat(64),
      created_at: null,
      payload: { feature: { key: "FEAT-001", title: "Context" }, readiness: null },
      markdown: "# Forge Context Package",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/repositories") && !init?.method) return response([repository]);
      if (url.includes("/features/feature-1/repositories")) return response([]);
      if (url.includes("/context/packages") && !init?.method) return response([]);
      if (url.endsWith("/context/preview")) return response(packageData);
      return response([]);
    });
    render(<MemoryRouter initialEntries={["/projects/project-1/features/feature-1/context"]}><Routes><Route element={<FeatureContextPage onOpenPalette={() => undefined} workspace={workspace} />} path="/projects/:projectId/features/:featureId/context" /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Context package", level: 1 })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Preview package" }));
    expect(await screen.findByText("forge-context-v1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Readiness" }));
    expect(screen.getByText("No saved readiness evaluation is included.")).toBeInTheDocument();
    expect(screen.getByText("0 saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Provenance & limits" }));
    expect(screen.getByText(/Local paths, remote URLs, credentials/)).toBeInTheDocument();
  });
});
