import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const detailedDocument = {
  schema_version: "forge-project-import-v1" as const,
  project: { name: "Detailed project" },
  epics: [{ ref: "epic:foundation", title: "Foundation", status: "planning" as const }],
  features: [
    {
      ref: "feature:bootstrap",
      title: "Bootstrap workspace",
      epic_ref: "epic:foundation",
      tasks: [{ ref: "task:workspace", title: "Create workspace" }],
      acceptance_criteria: [
        { ref: "criterion:empty-state", description: "The empty state explains the next step." },
      ],
    },
    { ref: "feature:delivery", title: "Delivery", tasks: [], acceptance_criteria: [] },
  ],
  dependencies: [
    { blocking_feature_ref: "feature:bootstrap", blocked_feature_ref: "feature:delivery" },
  ],
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
    expect(screen.queryByRole("button", { name: "Confirm import" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "Ready to create" })).toBeVisible();
    const confirm = screen.getByRole("button", { name: "Confirm import" });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(importProject).toHaveBeenCalledWith("w1", document, "a".repeat(64)));
    expect(onImported).toHaveBeenCalledWith("p1");
  });

  test("preserves the validated hierarchy when Desktop confirmation fails", async () => {
    previewProjectImport.mockResolvedValue({
      schema_version: "forge-project-import-v1",
      workspace_id: "w1",
      fingerprint: "d".repeat(64),
      project_name_conflict: false,
      document: detailedDocument,
      counts: { epics: 1, features: 2, tasks: 1, acceptance_criteria: 1, dependencies: 1 },
    });
    importProject.mockRejectedValue(new Error("desktop API route unavailable"));

    render(<ProjectImportPanel onClose={vi.fn()} onImported={vi.fn()} workspace={{ id: "w1", name: "Workspace" } as never} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Project import JSON" }), {
      target: { value: JSON.stringify(detailedDocument) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    const preview = await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Import needs attention");
    expect(alert).toHaveTextContent("Desktop bridge rejected this request");
    expect(screen.getByText("Step 3 of 3", { exact: false })).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(within(preview).getByText("Foundation", { exact: true })).toBeVisible();
    expect(within(preview).getByText("Bootstrap workspace", { exact: true })).toBeVisible();
  });

  test("renders a bounded hierarchy with associations, children, and dependencies", async () => {
    previewProjectImport.mockResolvedValue({
      schema_version: "forge-project-import-v1",
      workspace_id: "w1",
      fingerprint: "b".repeat(64),
      project_name_conflict: false,
      document: detailedDocument,
      counts: { epics: 1, features: 2, tasks: 1, acceptance_criteria: 1, dependencies: 1 },
    });

    render(<ProjectImportPanel onClose={vi.fn()} onImported={vi.fn()} workspace={{ id: "w1", name: "Workspace" } as never} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Project import JSON" }), {
      target: { value: JSON.stringify(detailedDocument) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    const preview = await screen.findByRole("status");
    expect(within(preview).getByText("Foundation", { exact: true })).toBeVisible();
    expect(within(preview).getByText("Bootstrap workspace", { exact: true })).toBeVisible();
    expect(within(preview).getByText("Epic: Foundation", { exact: true })).toBeVisible();
    expect(within(preview).getByText("Create workspace", { exact: true })).toBeVisible();
    expect(
      within(preview).getByText("The empty state explains the next step.", { exact: true }),
    ).toBeVisible();
    expect(within(preview).getByText("Bootstrap workspace → Delivery", { exact: true })).toBeVisible();
    expect(within(preview).getByText("Fingerprint: " + "b".repeat(64))).toBeVisible();
  });

  test("bounds large child lists while keeping their totals visible", async () => {
    const largeDocument = {
      ...document,
      features: Array.from({ length: 25 }, (_, index) => ({
        ref: `feature:item-${index}`,
        title: `Feature ${index}`,
        tasks: [],
        acceptance_criteria: [],
      })),
    };
    previewProjectImport.mockResolvedValue({
      schema_version: "forge-project-import-v1",
      workspace_id: "w1",
      fingerprint: "c".repeat(64),
      project_name_conflict: false,
      document: largeDocument,
      counts: { epics: 0, features: 25, tasks: 0, acceptance_criteria: 0, dependencies: 0 },
    });

    render(<ProjectImportPanel onClose={vi.fn()} onImported={vi.fn()} workspace={{ id: "w1", name: "Workspace" } as never} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Project import JSON" }), {
      target: { value: JSON.stringify(largeDocument) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    const preview = await screen.findByRole("status");
    expect(within(preview).getByText("Feature 0", { exact: true })).toBeVisible();
    expect(within(preview).queryByText("Feature 24", { exact: true })).not.toBeInTheDocument();
    expect(within(preview).getByText("Showing 20 of 25 features", { exact: true })).toBeVisible();
    expect(within(preview).getByText("25 features", { exact: true })).toBeVisible();
  });
});
