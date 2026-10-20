import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReadinessPanel } from "./components/ReadinessPanel";

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
  title: "Planning readiness",
  description: "Explain readiness before implementation.",
  goal: "Make the next action clear.",
  priority: "high" as const,
  status: "backlog" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const evaluation = {
  evaluation_id: null,
  feature_id: feature.id,
  evaluated_at: "2026-01-01T00:00:00Z",
  rule_set_version: "rfx03-v1",
  input_fingerprint: "a".repeat(64),
  outcome: "NOT_READY" as const,
  passed_checks: ["R02", "R04", "R06"],
  failed_checks: ["R01", "R03", "R05"],
  blockers: [],
  results: [
    {
      rule_id: "R01",
      rule_version: "1",
      result: "failed" as const,
      explanation: "The feature definition needs more context.",
      blockers: [
        {
          code: "R01_GOAL",
          message: "Describe the functional goal before starting implementation.",
          references: [{ kind: "feature", id: feature.id, label: feature.key }],
        },
      ],
      references: [{ kind: "feature", id: feature.id, label: feature.key }],
    },
    {
      rule_id: "R02",
      rule_version: "1",
      result: "passed" as const,
      explanation: "Acceptance criteria describe the expected behavior.",
      blockers: [],
      references: [],
    },
    {
      rule_id: "R03",
      rule_version: "1",
      result: "failed" as const,
      explanation: "One or more blocking features are still pending.",
      blockers: [
        {
          code: "R03_PENDING_DEPENDENCY",
          message: "FEAT-002 must be DONE before this feature can start.",
          references: [{ kind: "feature", id: "feature-2", label: "FEAT-002" }],
        },
      ],
      references: [{ kind: "feature", id: "feature-2", label: "FEAT-002" }],
    },
    {
      rule_id: "R04",
      rule_version: "1",
      result: "passed" as const,
      explanation: "Linked decisions are accepted.",
      blockers: [],
      references: [],
    },
    {
      rule_id: "R05",
      rule_version: "1",
      result: "failed" as const,
      explanation: "Review the applicable invariants before starting.",
      blockers: [
        {
          code: "R05_ACKNOWLEDGEMENT_REQUIRED",
          message: "Review invariant 'No false evidence' at revision 2.",
          references: [{ kind: "invariant", id: "invariant-1", label: "No false evidence" }],
        },
      ],
      references: [],
    },
    {
      rule_id: "R06",
      rule_version: "1",
      result: "passed" as const,
      explanation: "The project is active.",
      blockers: [],
      references: [],
    },
  ],
  stale: false,
};

type EvaluationFixture = Omit<typeof evaluation, "outcome"> & {
  outcome: "NOT_READY" | "READY_TO_START";
};

function response(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockReadinessRequests(current: EvaluationFixture = evaluation) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith("/readiness/preview")) return response(current);
    if (url.endsWith("/readiness/evaluations")) return response([]);
    if (url.endsWith(`/features/${feature.id}/invariants`)) return response([]);
    if (url.endsWith(`/features/${feature.id}/decisions`)) return response([]);
    if (url.endsWith("/projects/project-1/decisions")) return response([]);
    return response([]);
  });
}

describe("UX-01B actionable readiness", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders backend rule blockers with contextual actions and keeps unknown codes safe", async () => {
    const withUnknown = {
      ...evaluation,
      results: [
        ...evaluation.results,
        {
          rule_id: "R99",
          rule_version: "1",
          result: "failed" as const,
          explanation: "A future rule was returned.",
          blockers: [
            {
              code: "R99_UNKNOWN",
              message: "A future blocker must remain visible.",
              references: [],
            },
          ],
          references: [],
        },
      ],
      failed_checks: [...evaluation.failed_checks, "R99"],
    };
    mockReadinessRequests(withUnknown);

    render(
      <MemoryRouter>
        <ReadinessPanel
          feature={feature}
          projectId="project-1"
          refreshKey={0}
          workspace={workspace}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("NOT READY")).toBeInTheDocument();
    expect(screen.getByText("3 / 7 rules passed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit definition" })).toHaveAttribute(
      "href",
      "#feature-definition",
    );
    expect(screen.getByRole("link", { name: "Open blocking feature" })).toHaveAttribute(
      "href",
      "/projects/project-1/features/feature-2",
    );
    expect(screen.getByRole("link", { name: "Review invariants" })).toHaveAttribute(
      "href",
      "#readiness-invariants",
    );
    expect(screen.getByText("A future blocker must remain visible.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "A future blocker must remain visible." })).not.toBeInTheDocument();
  });

  it("keeps archived readiness read-only while allowing current preview", async () => {
    const archivedEvaluation = {
      ...evaluation,
      outcome: "NOT_READY" as const,
      failed_checks: ["R01", "R02", "R03", "R05"],
      passed_checks: ["R04", "R06"],
      results: evaluation.results.map((result) =>
        result.rule_id === "R02"
          ? {
              ...result,
              result: "failed" as const,
              explanation: "Acceptance criteria need review.",
              blockers: [
                {
                  code: "R02_CRITERIA_REQUIRED",
                  message: "Add acceptance criteria before starting.",
                  references: [],
                },
              ],
            }
          : result,
      ),
    };
    mockReadinessRequests(archivedEvaluation);

    render(
      <MemoryRouter>
        <ReadinessPanel
          archived
          feature={feature}
          projectId="project-1"
          refreshKey={0}
          workspace={workspace}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("NOT READY")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/archived project.*read-only/i);
    expect(screen.getByRole("button", { name: "Preview current" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Evaluate & save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acknowledge review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review definition" })).toHaveAttribute(
      "href",
      "#feature-definition",
    );
    expect(
      screen.getByRole("link", { name: "Review acceptance criteria" }),
    ).toHaveAttribute("href", "#acceptance-criteria");
    expect(screen.queryByRole("link", { name: "Edit definition" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add criteria" })).not.toBeInTheDocument();
  });

  it("does not render a readiness preview returned for another feature", async () => {
    mockReadinessRequests({
      ...evaluation,
      feature_id: "feature-2",
      outcome: "READY_TO_START",
      failed_checks: [],
      passed_checks: evaluation.results.map((result) => result.rule_id),
    });

    render(
      <MemoryRouter>
        <ReadinessPanel
          feature={feature}
          projectId="project-1"
          refreshKey={0}
          workspace={workspace}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Readiness preview is unavailable for this Feature.",
    );
    expect(screen.queryByText("READY TO START")).not.toBeInTheDocument();
  });

  it("refreshes preview after a planning mutation without changing saved history", async () => {
    let previewReads = 0;
    const saved = { ...evaluation, evaluation_id: "saved-1", stale: true };
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/readiness/preview")) {
        previewReads += 1;
        return response(previewReads === 1 ? evaluation : { ...evaluation, outcome: "READY_TO_START", failed_checks: [], stale: false });
      }
      if (url.endsWith("/readiness/evaluations")) return response([saved]);
      if (url.endsWith(`/features/${feature.id}/invariants`)) return response([]);
      if (url.endsWith(`/features/${feature.id}/decisions`)) return response([]);
      if (url.endsWith("/projects/project-1/decisions")) return response([]);
      if (init?.method === "POST") return response({});
      return response([]);
    });

    const onPreviewChange = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <ReadinessPanel
          feature={feature}
          onPreviewChange={onPreviewChange}
          projectId="project-1"
          refreshKey={0}
          workspace={workspace}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText("NOT READY")).toBeInTheDocument();
    expect(screen.getByText("STALE")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ReadinessPanel
          feature={feature}
          onPreviewChange={onPreviewChange}
          projectId="project-1"
          refreshKey={1}
          workspace={workspace}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText("READY TO START")).toBeInTheDocument();
    expect(screen.getByText("STALE")).toBeInTheDocument();
    await waitFor(() => expect(onPreviewChange).toHaveBeenCalled());
  });
});
