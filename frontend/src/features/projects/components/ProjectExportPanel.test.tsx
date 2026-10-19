import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ProjectExportPanel } from "./ProjectExportPanel";

const { getPlanningOverview, exportProject } = vi.hoisted(() => ({
  getPlanningOverview: vi.fn(),
  exportProject: vi.fn(),
}));

vi.mock("../../../api", () => ({
  forgeApi: { getPlanningOverview, exportProject },
}));

const project = {
  id: "p1",
  workspace_id: "w1",
  name: "Archived planning",
  description: null,
  status: "archived" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  archived_at: "2026-01-03T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectExportPanel", () => {
  test("shows real planning counts for archived projects and downloads read-only JSON", async () => {
    getPlanningOverview.mockResolvedValue({
      epics: 2,
      features: 4,
      tasks: 7,
      acceptance_criteria: 5,
      satisfied_criteria: 2,
      dependencies: 1,
    });
    exportProject.mockResolvedValue(undefined);

    render(
      <ProjectExportPanel
        onClose={vi.fn()}
        project={project}
        workspace={{ id: "w1", name: "Workspace" } as never}
      />,
    );

    expect(await screen.findByText("Archived planning", { exact: true })).toBeVisible();
    expect(screen.getByText("Workspace · Archived", { exact: true })).toBeVisible();
    expect(screen.getByText("2", { exact: true })).toBeVisible();
    expect(screen.getByText("forge-project-p1-import-v1.json", { exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
    await waitFor(() => expect(exportProject).toHaveBeenCalledWith("w1", "p1"));
    expect(screen.getByText("Read-only operation · Existing Project unchanged", { exact: true })).toBeVisible();
  });
});
