import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeliveryPage } from "./index";

const workspace = {
  id: "workspace-1",
  name: "Local Workspace",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const project = {
  id: "project-1",
  workspace_id: workspace.id,
  name: "Forge",
  description: null,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  archived_at: null,
};

const evidence = {
  id: "evidence-1",
  project_id: project.id,
  feature_id: null,
  acceptance_criterion_id: null,
  run_id: null,
  handoff_revision_id: null,
  context_package_id: null,
  git_observation_id: null,
  evidence_type: "reported_test_result",
  title: "User-reported check",
  description: "A person reported running a check.",
  source_kind: "manual",
  source_reference: null,
  provenance: "REPORTED",
  declared_outcome: "The check passed.",
  status: "ACTIVE",
  version: 1,
  recorded_at: "2026-01-01T00:00:00Z",
  invalidated_at: null,
};

const rules = [
  {
    rule_id: "V01",
    version: "1",
    title: "Saved context digest",
    available: true,
    required_inputs: [],
    limitation: "Compares a declared digest with a saved context snapshot.",
  },
  {
    rule_id: "V02",
    version: "1",
    title: "Evidence links",
    available: true,
    required_inputs: [],
    limitation: "Checks the selected saved evidence records.",
  },
];

const blockedEvaluation = {
  id: null,
  project_id: project.id,
  feature_id: null,
  rule_id: "V01",
  rule_version: "1",
  subject: {},
  inputs: {},
  input_fingerprint: "b".repeat(64),
  result: "BLOCKED",
  findings: ["A saved digest is required."],
  limitations: ["This check does not validate implementation behavior."],
  evidence_ids: [],
  verifier_version: "forge-verifier-v1",
  evaluated_at: "2026-01-01T00:00:00Z",
  stale: false,
};

function response(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderDelivery(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <DeliveryPage
              onOpenPalette={() => undefined}
              workspace={workspace}
            />
          }
          path="/projects/:projectId/delivery/*"
        />
      </Routes>
    </MemoryRouter>,
  );
}

function mockDeliveryApi(preview = false) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith(`/projects/${project.id}`)) return response(project);
    if (url.endsWith("/features")) return response([]);
    if (url.endsWith("/evidence")) return response([evidence]);
    if (url.endsWith("/verifications/rules")) return response(rules);
    if (url.endsWith("/verifications/preview") && preview)
      return response(blockedEvaluation);
    if (url.endsWith("/verifications")) return response([]);
    if (url.endsWith("/release-candidates")) return response([]);
    if (url.endsWith("/handoffs")) return response([]);
    if (url.endsWith("/repositories")) return response([]);
    return response([]);
  });
}

describe("Delivery feature routes and provenance", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("interprets the existing delivery wildcard and keeps reported evidence reported", async () => {
    mockDeliveryApi();
    renderDelivery(`/projects/${project.id}/delivery/evidence`);

    expect(
      await screen.findByRole("heading", {
        name: "Evidence inventory",
        level: 1,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /User-reported check/ }));

    expect(
      await screen.findByRole("heading", { name: evidence.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("REPORTED")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This record does not become verified because of its type or declared outcome.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a scoped verification preview without implying verification beyond its rule", async () => {
    mockDeliveryApi(true);
    renderDelivery(`/projects/${project.id}/delivery/verifications/new`);

    expect(
      await screen.findByRole("heading", {
        name: "Verification center",
        level: 1,
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rule"), {
      target: { value: "V01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(
      await screen.findByText("A saved digest is required."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Compares a declared digest with a saved context snapshot.",
      ),
    ).toHaveLength(2);
    await waitFor(() =>
      expect(screen.getByText("BLOCKED")).toBeInTheDocument(),
    );
  });
});
