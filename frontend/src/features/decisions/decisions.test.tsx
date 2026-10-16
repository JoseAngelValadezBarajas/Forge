import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

  it("keeps decision content after a failed create and recovers on retry", async () => {
    const submitted: Array<Record<string, unknown>> = [];
    let decisions: unknown[] = [];
    let createAttempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/decisions") && init?.method === "POST") {
        submitted.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        createAttempts += 1;
        if (createAttempts === 1)
          return response({ detail: "Decision store is temporarily unavailable." }, 503);
        decisions = [{ ...decision, ...submitted.at(-1), status: "proposed" }];
        return response(decisions[0], 201);
      }
      if (url.endsWith("/decisions")) return response(decisions);
      return response([]);
    });

    renderDecisions();
    fireEvent.click(await screen.findByRole("button", { name: "+ New decision" }));
    const form = screen.getByRole("heading", { name: "Create decision" }).closest("form");
    if (!form) throw new Error("Decision form was not rendered.");
    const submit = () => within(form).getByRole("button", { name: "Create decision" });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Retain delivery provenance" },
    });
    fireEvent.change(screen.getByLabelText("Decision context"), {
      target: { value: "A failed save must not discard the review." },
    });
    fireEvent.change(screen.getByLabelText("Decision"), {
      target: { value: "Keep the snapshot immutable." },
    });
    fireEvent.change(screen.getByLabelText("Decision rationale"), {
      target: { value: "Historical evidence must remain stable." },
    });
    fireEvent.click(submit());

    expect(
      await screen.findByText("Could not save the decision. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue(
      "Retain delivery provenance",
    );
    expect(screen.getByLabelText("Decision context")).toHaveValue(
      "A failed save must not discard the review.",
    );

    fireEvent.click(submit());
    expect(
      await screen.findByRole("heading", {
        name: "Retain delivery provenance",
      }),
    ).toBeInTheDocument();
    expect(createAttempts).toBe(2);
    expect(submitted[1]).toEqual({
      title: "Retain delivery provenance",
      context: "A failed save must not discard the review.",
      decision: "Keep the snapshot immutable.",
      rationale: "Historical evidence must remain stable.",
    });
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

  it("reloads a changed invariant after the exact-revision acknowledgement conflicts", async () => {
    const revisions = [3, 4];
    let invariantReads = 0;
    let acknowledgementPayload: unknown;
    const currentInvariant = (revision: number) => ({
      id: "invariant-1",
      project_id: "project-1",
      feature_id: feature.id,
      title: "Preserve approved constraints",
      statement:
        revision === 3
          ? "Revision three statement shown before submit."
          : "Revision four statement now requires review.",
      rationale: "The acknowledged text must be the text the reviewer saw.",
      status: "active",
      revision,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      acknowledged_revision: null,
      acknowledged_at: null,
      needs_acknowledgement: true,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/readiness/preview"))
        return response({
          evaluation_id: null,
          feature_id: feature.id,
          evaluated_at: "2026-01-01T00:00:00Z",
          rule_set_version: "rfx03-v1",
          input_fingerprint: "a".repeat(64),
          outcome: "NOT_READY",
          passed_checks: [],
          failed_checks: ["R02"],
          blockers: [],
          results: [],
          stale: false,
        });
      if (url.endsWith("/readiness/evaluations")) return response([]);
      if (url.endsWith(`/features/${feature.id}/invariants`)) {
        const revision = revisions[Math.min(invariantReads, 1)];
        invariantReads += 1;
        return response([currentInvariant(revision)]);
      }
      if (
        url.endsWith(`/features/${feature.id}/decisions`) ||
        url.endsWith("/projects/project-1/decisions")
      )
        return response([]);
      if (url.endsWith("/invariants/invariant-1/acknowledge")) {
        acknowledgementPayload = JSON.parse(String(init?.body)) as unknown;
        return response({ detail: "Invariant revision has changed." }, 409);
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

    expect(
      await screen.findByText("Revision three statement shown before submit."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge review" }));

    expect(
      await screen.findByText("Revision four statement now requires review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This invariant changed before review. The current revision was loaded; review it and try again.",
    );
    expect(acknowledgementPayload).toEqual({ expected_revision: 3 });
    expect(screen.getByRole("button", { name: "Acknowledge review" })).toBeEnabled();
  });

  it("keeps saved readiness history unchanged when only the current preview is refreshed", async () => {
    const savedSnapshot = {
      evaluation_id: "saved-1",
      feature_id: feature.id,
      evaluated_at: "2026-01-01T00:00:00Z",
      rule_set_version: "rfx03-v1",
      input_fingerprint: "b".repeat(64),
      outcome: "NOT_READY",
      passed_checks: [],
      failed_checks: ["R02"],
      blockers: [],
      results: [],
      stale: true,
    };
    const initialPreview = { ...savedSnapshot, evaluation_id: null, stale: false };
    const refreshedPreview = {
      ...initialPreview,
      outcome: "READY_TO_START",
      passed_checks: ["R02"],
    };
    let previewReads = 0;
    const savedRequests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/readiness/preview")) {
        previewReads += 1;
        return response(previewReads === 1 ? initialPreview : refreshedPreview);
      }
      if (url.endsWith("/readiness/evaluations")) {
        if (init?.method === "POST") savedRequests.push(url);
        return response([savedSnapshot]);
      }
      if (
        url.endsWith(`/features/${feature.id}/invariants`) ||
        url.endsWith(`/features/${feature.id}/decisions`) ||
        url.endsWith("/projects/project-1/decisions")
      )
        return response([]);
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

    expect(await screen.findByText("NOT READY")).toBeInTheDocument();
    expect(screen.getByText("STALE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview current" }));

    expect(await screen.findByText("READY TO START")).toBeInTheDocument();
    expect(screen.getByText("STALE")).toBeInTheDocument();
    expect(savedRequests).toEqual([]);
    expect(previewReads).toBe(2);
  });
});
