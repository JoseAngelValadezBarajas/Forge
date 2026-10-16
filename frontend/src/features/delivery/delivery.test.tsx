import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    version: "1.0",
    title: "Artifact integrity",
    available: false,
    required_inputs: ["managed artifact bytes", "expected SHA-256"],
    limitation: "Forge does not yet import or store artifact bytes.",
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
  findings: ["No managed artifact bytes are available for hashing."],
  limitations: [
    "Artifact import is outside this FND-06 implementation; declared references are not read or fetched.",
  ],
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

    expect(await screen.findByText("RULE UNSUPPORTED")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "No managed artifact bytes are available for hashing.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Forge does not yet import or store artifact bytes.",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Evaluate & Save" }),
    ).toBeDisabled();
    expect(screen.getAllByText("BLOCKED")).toHaveLength(2);
  });

  it("keeps a verification preview separate from saved evaluation history", async () => {
    const preview = {
      ...blockedEvaluation,
      id: null,
      rule_id: "V02",
      result: "BLOCKED",
      findings: ["Select evidence records before evaluating this rule."],
      evaluated_at: null,
    };
    const saved = {
      ...preview,
      id: "verification-1",
      evaluated_at: "2026-01-02T00:00:00Z",
    };
    let evaluations: unknown[] = [];
    const writes: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith(`/projects/${project.id}`)) return response(project);
      if (url.endsWith("/features")) return response([]);
      if (url.endsWith("/evidence")) return response([evidence]);
      if (url.endsWith("/verifications/rules")) return response(rules);
      if (url.endsWith("/verifications/preview")) {
        writes.push("preview");
        return response(preview);
      }
      if (url.endsWith("/verifications/evaluate") && init?.method === "POST") {
        writes.push("save");
        evaluations = [saved];
        return response(saved, 201);
      }
      if (url.endsWith("/verifications")) return response(evaluations);
      return response([]);
    });

    renderDelivery(`/projects/${project.id}/delivery/verifications/new`);
    expect(
      await screen.findByRole("heading", { name: "Verification center" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(
      await screen.findByText("Select evidence records before evaluating this rule."),
    ).toBeInTheDocument();
    expect(writes).toEqual(["preview"]);
    expect(screen.getByRole("button", { name: "Evaluate & Save" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Evaluate & Save" }));
    expect(
      await screen.findAllByText("Evaluation saved as an immutable snapshot."),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("link", { name: "Verifications" }));
    expect(await screen.findByText("1 snapshots")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Select evidence records before evaluating this rule\./,
      }),
    ).toBeInTheDocument();
    expect(writes).toEqual(["preview", "save"]);
  });

  it("announces an invalid evidence reference and preserves the form for correction", async () => {
    const submitted: Array<Record<string, unknown>> = [];
    let evidenceItems: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith(`/projects/${project.id}`)) return response(project);
      if (url.endsWith("/features")) return response([]);
      if (url.endsWith("/evidence") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        submitted.push(body);
        if (String(body.source_reference).startsWith("javascript:"))
          return response({ detail: "Evidence reference must use HTTPS." }, 422);
        const created = {
          ...evidence,
          id: "evidence-created",
          title: body.title,
          source_reference: body.source_reference,
          provenance: "REPORTED",
        };
        evidenceItems = [created];
        return response(created, 201);
      }
      if (url.endsWith("/evidence")) return response(evidenceItems);
      if (url.endsWith("/verifications/rules")) return response(rules);
      return response([]);
    });

    renderDelivery(`/projects/${project.id}/delivery/evidence/new`);
    expect(
      await screen.findByRole("heading", { name: "Register evidence" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Release note reference" },
    });
    fireEvent.change(screen.getByLabelText("Source reference"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register evidence" }));
    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Evidence reference must use HTTPS.");
    expect(screen.getByLabelText("Title")).toHaveValue("Release note reference");

    fireEvent.change(screen.getByLabelText("Source reference"), {
      target: { value: "https://example.test/release-notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register evidence" }));
    expect(await screen.findByRole("heading", { name: "Evidence records" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Release note reference/ })).toBeInTheDocument();
    expect(submitted).toHaveLength(2);
    expect(submitted[0]).toMatchObject({
      title: "Release note reference",
      source_reference: "javascript:alert(1)",
    });
    expect(submitted[1]).toMatchObject({
      title: "Release note reference",
      source_reference: "https://example.test/release-notes",
    });
  });

  it("keeps a frozen candidate read-only and exposes its saved manifest downloads", async () => {
    const candidate = {
      id: "candidate-1",
      project_id: project.id,
      candidate_key: "RC-001",
      title: "Forge Alpha candidate",
      intended_version: "0.1.0",
      description: "Pinned scope for review.",
      status: "FROZEN",
      schema_version: "forge-release-candidate-v1",
      revision: 1,
      content_fingerprint: "c".repeat(64),
      selection: {
        feature_ids: [],
        context_package_ids: [],
        evidence_ids: [],
        verification_ids: [],
        handoff_revision_ids: [],
      },
      snapshot: { title: "Frozen candidate title", scope: [] },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      frozen_at: "2026-01-02T00:00:00Z",
    };
    const currentGate = {
      id: null,
      project_id: project.id,
      candidate_id: candidate.id,
      candidate_revision: 1,
      ruleset_version: "forge-release-gates-v1",
      input_fingerprint: "a".repeat(64),
      result: "READY_BY_DEFINED_GATES",
      stored_result: null,
      checks: [
        {
          rule_id: "G01",
          version: "1",
          status: "PASS",
          explanation: "The frozen candidate has a valid scope.",
          inputs: [],
          blockers: [],
          limitations: ["This is not a publication approval."],
        },
      ],
      limitations: ["Defined gates do not prove product completeness."],
      manifest: { candidate_id: candidate.id },
      manifest_fingerprint: "b".repeat(64),
      evaluated_at: null,
      stale: false,
    };
    const savedGate = {
      ...currentGate,
      id: "gate-1",
      stored_result: "READY_BY_DEFINED_GATES",
      evaluated_at: "2026-01-03T00:00:00Z",
    };
    const manifest = {
      id: "manifest-1",
      project_id: project.id,
      candidate_id: candidate.id,
      gate_evaluation_id: savedGate.id,
      schema_version: "forge-release-manifest-v1",
      fingerprint: "d".repeat(64),
      payload: { candidate_id: candidate.id },
      markdown: "# Forge Alpha candidate",
      created_at: "2026-01-03T00:00:00Z",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith(`/projects/${project.id}`)) return response(project);
      if (url.endsWith("/features")) return response([]);
      if (url.endsWith("/evidence")) return response([]);
      if (url.endsWith("/verifications/rules")) return response(rules);
      if (url.endsWith("/release-candidates")) return response([candidate]);
      if (url.endsWith("/handoffs")) return response([]);
      if (url.endsWith("/repositories")) return response([]);
      if (url.endsWith(`/release-candidates/${candidate.id}/gates/preview`))
        return response(currentGate);
      if (url.endsWith(`/release-candidates/${candidate.id}/gates`))
        return response([savedGate]);
      if (url.endsWith(`/release-candidates/${candidate.id}/manifest`))
        return response(manifest);
      return response([]);
    });

    renderDelivery(
      `/projects/${project.id}/delivery/release-candidates/${candidate.id}`,
    );

    expect(
      await screen.findByRole("heading", { name: "Release gate evaluation" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("READY_BY_DEFINED_GATES")).toHaveLength(2);
    expect(screen.getByText("NOT PUBLISHED")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Freeze candidate snapshot" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Inspect frozen snapshot"));
    expect(screen.getByText(/Frozen candidate title/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download JSON" })).toHaveAttribute(
      "href",
      expect.stringContaining("format=json&manifest_id=manifest-1"),
    );
    expect(screen.getByRole("link", { name: "Download Markdown" })).toHaveAttribute(
      "href",
      expect.stringContaining("format=markdown&manifest_id=manifest-1"),
    );
  });

  it("pins only chosen, scope-compatible records and recovers from a rejected candidate create", async () => {
    const feature = {
      id: "feature-1",
      project_id: project.id,
      key: "FEAT-001",
      readable_id: "FEAT-001",
      title: "Keep delivery evidence scoped",
      description: null,
      goal: "Pin the correct records.",
      priority: "medium",
      status: "backlog",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const unrelatedFeature = { ...feature, id: "feature-other", readable_id: "FEAT-002" };
    const projectEvidence = { ...evidence, id: "evidence-project", title: "Project-level evidence" };
    const featureEvidence = {
      ...evidence,
      id: "evidence-feature",
      feature_id: feature.id,
      title: "Feature evidence",
    };
    const unrelatedEvidence = {
      ...evidence,
      id: "evidence-other",
      feature_id: unrelatedFeature.id,
      title: "Unrelated feature evidence",
    };
    const contextPackage = {
      id: "package-1",
      project_id: project.id,
      feature_id: feature.id,
      schema_version: "forge-context-v1",
      fingerprint: "e".repeat(64),
      created_at: "2026-01-01T00:00:00Z",
      payload: { schema: "forge-context-v1" },
    };
    const submitted: Array<Record<string, unknown>> = [];
    let candidates: unknown[] = [];
    let attempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith(`/projects/${project.id}`)) return response(project);
      if (url.endsWith("/features")) return response([feature, unrelatedFeature]);
      if (url.endsWith(`/features/${feature.id}/context/packages`))
        return response([contextPackage]);
      if (url.endsWith("/evidence")) return response([projectEvidence, featureEvidence, unrelatedEvidence]);
      if (url.endsWith("/verifications/rules")) return response(rules);
      if (url.endsWith("/release-candidates") && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        submitted.push(payload);
        attempts += 1;
        if (attempts === 1)
          return response({ detail: "A selected record is no longer eligible." }, 409);
        const created = {
          id: "candidate-created",
          project_id: project.id,
          candidate_key: "RC-002",
          title: payload.title,
          intended_version: payload.intended_version,
          description: payload.description,
          status: "DRAFT",
          schema_version: "forge-release-candidate-v1",
          revision: 1,
          content_fingerprint: "f".repeat(64),
          selection: {
            feature_ids: payload.feature_ids,
            context_package_ids: payload.context_package_ids,
            evidence_ids: payload.evidence_ids,
            verification_ids: payload.verification_ids,
            handoff_revision_ids: payload.handoff_revision_ids,
          },
          snapshot: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          frozen_at: null,
        };
        candidates = [created];
        return response(created, 201);
      }
      if (url.endsWith("/release-candidates")) return response(candidates);
      return response([]);
    });

    renderDelivery(`/projects/${project.id}/delivery/release-candidates/new`);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Create release candidate",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Unrelated feature evidence")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create candidate" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Candidate label"), {
      target: { value: "Forge Alpha" },
    });
    fireEvent.change(screen.getByLabelText("Intended version (optional)"), {
      target: { value: "0.1.0" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /FEAT-001/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Project-level evidence/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Feature evidence/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /forge-context-v1/ }));
    expect(screen.queryByLabelText("Unrelated feature evidence")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create candidate" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("A selected record is no longer eligible.");
    expect(screen.getByLabelText("Candidate label")).toHaveValue("Forge Alpha");
    expect(screen.getByRole("checkbox", { name: /Feature evidence/ })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Create candidate" }));
    expect(await screen.findByRole("heading", { name: "Forge Alpha" })).toBeInTheDocument();
    expect(attempts).toBe(2);
    expect(submitted[1]).toMatchObject({
      title: "Forge Alpha",
      intended_version: "0.1.0",
      feature_ids: [feature.id],
      context_package_ids: [contextPackage.id],
      evidence_ids: [projectEvidence.id, featureEvidence.id],
      verification_ids: [],
      handoff_revision_ids: [],
    });
  });
});
