import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { EpicDetailPage } from "./EpicDetailPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EpicDetailPage", () => {
  it("shows the Epic context and linked Features from the API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/projects/project-1") && !url.includes("/epics") && !url.includes("/features")) {
        return Promise.resolve(new Response(JSON.stringify({ id: "project-1", name: "Forge" }), { status: 200 }));
      }
      if (url.endsWith("/epics")) {
        return Promise.resolve(new Response(JSON.stringify([{ id: "epic-1", project_id: "project-1", title: "Product clarity", description: "Intent", status: "planning" }]), { status: 200 }));
      }
      if (url.includes("/features")) {
        return Promise.resolve(new Response(JSON.stringify([{ id: "feature-1", project_id: "project-1", epic_id: "epic-1", key: "FEAT-001", title: "Navigation clarity", priority: "high", status: "backlog" }]), { status: 200 }));
      }
      return Promise.resolve(new Response("[]", { status: 200 }));
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/epics/epic-1"]}>
        <Routes>
          <Route
            element={<EpicDetailPage onOpenPalette={() => undefined} workspace={{ id: "ws-1", name: "Local", description: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }} />}
            path="/projects/:projectId/epics/:epicId"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { level: 2, name: "Product clarity" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /FEAT-001/ })).toHaveAttribute(
      "href",
      "/projects/project-1/features/feature-1",
    );
  });
});
