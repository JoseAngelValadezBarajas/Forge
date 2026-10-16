import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DecisionsPage } from "./index";
import { ReadinessPanel } from "../readiness";

const workspace = {
  id: "workspace-1",
  name: "Local Workspace",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const feature = {
  id: "feature-1",
  key: "FEAT-001",
  readable_id: "FEAT-001",
  project_id: "project-1",
  epic_id: null,
  title: "Preserve a reviewed constraint",
  description: null,
  goal: "Keep the constraint visible",
  priority: "medium" as const,
  status: "backlog" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const decision = {
  id: "decision-1",
  project_id: "project-1",
  title: "Keep snapshots immutable",
  context: "Delivery provenance must remain inspectable.",
  decision: "Persist historical snapshots.",
  rationale: "Reviewers need stable evidence.",
  alternatives_considered: null,
  tradeoffs: null,
  status: "proposed",
  superseded_by_id: null,
  revision: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function response(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderDecisions() {
  return render(
    <MemoryRouter initialEntries={["/projects/project-1/decisions"]}>
      <Routes>
        <Route
          element={
            <DecisionsPage
              onOpenPalette={() => undefined}
              workspace={workspace}
            />
          }
          path="/projects/:projectId/decisions"
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Decisions and Readiness feature surfaces", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("accepts a proposed decision and renders the persisted state", async () => {
    let current = decision;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/decisions/decision-1/accept")) {
        current = { ...current, status: "accepted" };
        return response(current);
      }
      if (url.endsWith("/decisions")) return response([current]);
      return response([]);
    });

    renderDecisions();
    expect(
      await screen.findByRole("heading", { name: decision.title }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept decision" }));

    await waitFor(() =>
      expect(screen.getByText("accepted")).toBeInTheDocument(),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/workspaces/workspace-1/projects/project-1/decisions/decision-1/accept",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows complete decision revision content in history", async () => {
    const historical = {
      ...decision,
      id: "revision-1",
      decision_id: decision.id,
      revision: 1,
      rationale: "Historical rationale.",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).endsWith("/decisions/decision-1/revisions")
        ? response([historical])
        : response([decision]),
    );

    renderDecisions();
    await screen.findByRole("heading", { name: decision.title });
    fireEvent.click(screen.getByRole("button", { name: "History" }));

    expect(
      await screen.findByText("Historical rationale."),
    ).toBeInTheDocument();
    expect(screen.getByText("Historical revisions")).toBeInTheDocument();
  });

  it("shows the invariant revision and sends that exact revision for acknowledgement", async () => {
    const invariant = {
      id: "invariant-1",
      project_id: "project-1",
      feature_id: null,
      title: "Keep release snapshots immutable",
      statement: "A frozen release snapshot must not be edited.",
      rationale: "Auditors need stable provenance.",
      status: "active",
      revision: 3,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      acknowledged_revision: null,
      acknowledged_at: null,
      needs_acknowledgement: true,
    };
    const evaluation = {
      evaluation_id: null,
      feature_id: feature.id,
      evaluated_at: "2026-01-01T00:00:00Z",
      rule_set_version: "rfx03-v1",
      input_fingerprint: "a".repeat(64),
      outcome: "NOT_READY",
      passed_checks: [],
      failed_checks: ["R02"],
      blockers: [
        { code: "R02", message: "Add acceptance criteria.", references: [] },
      ],
      results: [
        {
          rule_id: "R02",
          rule_version: "1",
          result: "failed",
          explanation: "Acceptance criteria are missing.",
          blockers: [
            {
              code: "R02",
              message: "Add acceptance criteria.",
              references: [],
            },
          ],
          references: [],
        },
      ],
      stale: false,
    };
    let needsAcknowledgement = true;
    let acknowledgementBody: unknown;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/readiness/preview")) return response(evaluation);
      if (url.endsWith("/readiness/evaluations")) return response([]);
      if (url.endsWith("/features/feature-1/invariants")) {
        return response([
          { ...invariant, needs_acknowledgement: needsAcknowledgement },
        ]);
      }
      if (
        url.endsWith("/features/feature-1/decisions") ||
        url.endsWith("/projects/project-1/decisions")
      )
        return response([]);
      if (url.endsWith("/invariants/invariant-1/acknowledge")) {
        acknowledgementBody = JSON.parse(String(init?.body));
        needsAcknowledgement = false;
        return response({
          id: "ack-1",
          feature_id: feature.id,
          invariant_id: invariant.id,
          acknowledged_revision: 3,
          acknowledged_at: "2026-01-02T00:00:00Z",
        });
      }
      return response([]);
    });

    render(
      <ReadinessPanel
        feature={feature}
        projectId="project-1"
        refreshKey={0}
        workspace={workspace}
      />,
    );

    expect(await screen.findByText(invariant.statement)).toBeInTheDocument();
    expect(screen.getByText(`Why: ${invariant.rationale}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge review" }));

    await waitFor(() =>
      expect(
        screen.getByText("Reviewed · not technical proof"),
      ).toBeInTheDocument(),
    );
    expect(acknowledgementBody).toEqual({ expected_revision: 3 });
    expect(screen.getByText("NOT READY")).toBeInTheDocument();
  });
});
