import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ProjectImportPanel } from "./ProjectImportPanel";

const { previewProjectImport, importProject } = vi.hoisted(() => ({
  previewProjectImport: vi.fn(),
  importProject: vi.fn(),
}));

vi.mock("../../../api", () => ({
  forgeApi: { previewProjectImport, importProject },
}));

const document = {
  schema_version: "forge-project-import-v1" as const,
  project: { name: "Imported project" },
  epics: [],
  features: [],
  dependencies: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectImportPanel", () => {
  test("requires a valid read-only preview before confirmation", async () => {
    previewProjectImport.mockResolvedValue({
      schema_version: "forge-project-import-v1",
      workspace_id: "w1",
      fingerprint: "a".repeat(64),
      project_name_conflict: false,
      document,
      counts: { epics: 0, features: 0, tasks: 0, acceptance_criteria: 0, dependencies: 0 },
    });
    importProject.mockResolvedValue({ project_id: "p1" });
    const onImported = vi.fn();

    render(<ProjectImportPanel onClose={vi.fn()} onImported={onImported} workspace={{ id: "w1", name: "Workspace" } as never} />);
    const confirm = screen.getByRole("button", { name: "Confirm import" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Project import JSON" }), {
      target: { value: "not json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not valid JSON");
    expect(previewProjectImport).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Project import JSON" }), {
      target: { value: JSON.stringify(document) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Preview validated");
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(importProject).toHaveBeenCalledWith("w1", document, "a".repeat(64)));
    expect(onImported).toHaveBeenCalledWith("p1");
  });
});
