import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";

import App from "../../app/App";
import { FeatureDetailPage } from "./index";
import { PlanningPage } from "./pages/PlanningPage";

const workspace = {
  id: "ws-1",
  name: "Local Workspace",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const project = {
  id: "project-1",
  workspace_id: "ws-1",
  name: "Forge",
  description: "Planning",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  archived_at: null,
};
const feature = {
  id: "feature-1",
  key: "FEAT-001",
  readable_id: "FEAT-001",
  project_id: "project-1",
  epic_id: null,
  title: "Workspace planning",
  description: "Plan the slice",
  goal: null,
  priority: "high",
  status: "backlog",
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

describe("FND-02 planning views", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/projects/project-1/board");
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/workspaces") && !init?.method)
        return response([workspace]);
      if (url.endsWith("/workspaces/ws-1/projects/project-1") && !init?.method)
        return response(project);
      if (url.includes("/planning/overview"))
        return response({
          epics: 0,
          features: 1,
          tasks: 0,
          acceptance_criteria: 0,
          satisfied_criteria: 0,
          dependencies: 0,
        });
      if (url.includes("/epics")) return response([]);
      if (
        url.includes("/features") &&
        !url.includes("/tasks") &&
        !url.includes("acceptance-criteria")
      )
        return response([feature]);
      if (url.includes("/dependencies")) return response([]);
      if (url.includes("/tasks")) return response([]);
      if (url.includes("/acceptance-criteria")) return response([]);
      return response([]);
    });
  });

  it("renders a persisted feature on the board and keeps the manual-state disclaimer visible", async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Project Board" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Workspace planning" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Manual planning state only/)).toBeInTheDocument();
  });

  it("applies status and priority filters through the API and can reset them", async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    await screen.findByRole("heading", { name: "Project Board" });

    const requests = () =>
      vi.mocked(globalThis.fetch).mock.calls.map(([input]) => String(input));
    fireEvent.change(screen.getByLabelText("Feature workflow"), {
      target: { value: "ready" },
    });
    fireEvent.change(screen.getByLabelText("Feature priority"), {
      target: { value: "high" },
    });
    await waitFor(() =>
      expect(
        requests().some((url) =>
          url.includes("/features?status=ready&priority=high"),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByLabelText("Feature workflow")).toHaveValue("");
    expect(screen.getByLabelText("Feature priority")).toHaveValue("");
  });

  it("opens the feature form without claiming verification evidence", async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    await screen.findByRole("heading", { name: "Project Board" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "+ Feature" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Feature" }));
    expect(
      screen.getByRole("heading", { name: "Create feature" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Manual planning state only/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("CI passed")).not.toBeInTheDocument(),
    );
  });

  it.each(["/projects/project-1/features?create=1", "/projects/project-1/board?create=epic"])(
    "keeps archived planning routes read-only, including creation deep links: %s",
    async (entry) => {
      vi.mocked(globalThis.fetch).mockImplementation((input) => {
        const url = String(input);
        if (url.endsWith("/projects/project-1")) return response({ ...project, status: "archived" });
        if (url.includes("/planning/overview")) return response({ epics: 1, features: 1, tasks: 0, acceptance_criteria: 0, satisfied_criteria: 0, dependencies: 0 });
        if (url.endsWith("/epics")) return response([{ id: "epic-1", project_id: "project-1", title: "Intent epic", description: "Intent", status: "planning", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }]);
        if (url.includes("/features") && !url.includes("/tasks") && !url.includes("acceptance-criteria")) return response([{ ...feature, epic_id: "epic-1" }]);
        if (url.includes("/dependencies")) return response([]);
        return response([]);
      });

      render(
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route
              element={<PlanningPage mode={entry.includes("/board") ? "board" : "features"} onOpenPalette={() => undefined} workspace={workspace} />}
              path="/projects/:projectId/:view"
            />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByRole("heading", { name: entry.includes("/board") ? "Project Board" : "Features & Epics" })).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/archived project.*read-only/i);
      expect(screen.getByRole("button", { name: "+ Epic" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "+ Feature" })).toBeDisabled();
      expect(screen.getByRole("combobox", { name: `Status for ${feature.key}` })).toBeDisabled();
      if (entry.includes("/features")) {
        expect(screen.getByRole("button", { name: "Edit epic" })).toBeDisabled();
      }
      expect(screen.queryByRole("heading", { name: "Create feature" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Create epic" })).not.toBeInTheDocument();
      expect(vi.mocked(globalThis.fetch).mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
    },
  );

  it("reopens palette-created Epic and Feature forms after closing them on the same routes", async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    await screen.findByRole("heading", { name: "Project Board" });

    const openPalette = () =>
      fireEvent.click(
        screen.getByRole("button", { name: /Search or command/ }),
      );
    const choose = (label: string) =>
      fireEvent.click(
        screen.getByRole("option", { name: new RegExp(`^${label}`) }),
      );

    openPalette();
    choose("Create Epic");
    expect(
      await screen.findByRole("heading", { name: "Create epic" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(
      screen.queryByRole("heading", { name: "Create epic" }),
    ).not.toBeInTheDocument();
    expect(window.location.search).toBe("");

    openPalette();
    choose("Create Epic");
    expect(
      await screen.findByRole("heading", { name: "Create epic" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));

    fireEvent.click(screen.getByRole("link", { name: /^Features$/ }));
    expect(
      await screen.findByRole("heading", { name: "Features & Epics" }),
    ).toBeInTheDocument();

    openPalette();
    choose("Create Feature");
    expect(
      await screen.findByRole("heading", { name: "Create feature" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(
      screen.queryByRole("heading", { name: "Create feature" }),
    ).not.toBeInTheDocument();
    expect(window.location.search).toBe("");

    openPalette();
    choose("Create Feature");
    expect(
      await screen.findByRole("heading", { name: "Create feature" }),
    ).toBeInTheDocument();
  });

  it("edits planning records, reorders children, and keeps dependency perspectives isolated", async () => {
    let featureState = { ...feature, epic_id: null as string | null };
    const epic = {
      id: "epic-1",
      project_id: "project-1",
      title: "Intent epic",
      description: "Intent",
      status: "planning",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const otherFeature = {
      ...feature,
      id: "feature-2",
      key: "FEAT-002",
      readable_id: "FEAT-002",
      title: "Downstream feature",
    };
    const upstreamFeature = {
      ...feature,
      id: "feature-3",
      key: "FEAT-003",
      readable_id: "FEAT-003",
      title: "Upstream feature",
    };
    let tasks = [
      {
        id: "task-1",
        feature_id: "feature-1",
        title: "Task one",
        description: null,
        status: "todo",
        position: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "task-2",
        feature_id: "feature-1",
        title: "Task two",
        description: null,
        status: "todo",
        position: 1,
        created_at: "2026-01-01T00:00:01Z",
        updated_at: "2026-01-01T00:00:01Z",
      },
    ];
    let criteria = [
      {
        id: "criterion-1",
        feature_id: "feature-1",
        description: "Criterion one",
        satisfied: false,
        position: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    let dependencies = [
      {
        id: "dependency-1",
        project_id: "project-1",
        blocking_feature_id: "feature-1",
        blocked_feature_id: "feature-2",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "dependency-2",
        project_id: "project-1",
        blocking_feature_id: "feature-3",
        blocked_feature_id: "feature-1",
        created_at: "2026-01-01T00:00:01Z",
        updated_at: "2026-01-01T00:00:01Z",
      },
    ];
    let failFeatureUpdate = true;
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      if (method === "GET" && path.endsWith("/features/feature-1"))
        return response(featureState);
      if (method === "GET" && path.endsWith("/epics")) return response([epic]);
      if (method === "GET" && path.endsWith("/tasks")) return response(tasks);
      if (method === "GET" && path.endsWith("/acceptance-criteria"))
        return response(criteria);
      if (method === "GET" && path.endsWith("/dependencies"))
        return response(dependencies);
      if (method === "GET" && path.includes("/features"))
        return response([featureState, otherFeature, upstreamFeature]);
      if (method === "PATCH" && path.endsWith("/features/feature-1")) {
        if (failFeatureUpdate) {
          failFeatureUpdate = false;
          return response({ detail: "temporary feature failure" }, 500);
        }
        featureState = {
          ...featureState,
          ...body,
          epic_id: body.clear_epic
            ? null
            : ((body.epic_id as string | null | undefined) ??
              featureState.epic_id),
        };
        return response(featureState);
      }
      if (method === "PATCH" && path.includes("/tasks/task-1")) {
        tasks = tasks.map((task) =>
          task.id === "task-1" ? { ...task, ...body } : task,
        );
        return response(tasks[0]);
      }
      if (
        method === "PATCH" &&
        path.includes("/acceptance-criteria/criterion-1")
      ) {
        criteria = criteria.map((criterion) =>
          criterion.id === "criterion-1"
            ? { ...criterion, ...body }
            : criterion,
        );
        return response(criteria[0]);
      }
      if (method === "POST" && path.endsWith("/tasks/reorder")) {
        tasks = (body.ids as string[]).map((id, position) => ({
          ...tasks.find((task) => task.id === id)!,
          position,
        }));
        return response(tasks);
      }
      if (method === "POST" && path.endsWith("/acceptance-criteria/reorder")) {
        criteria = (body.ids as string[]).map((id, position) => ({
          ...criteria.find((criterion) => criterion.id === id)!,
          position,
        }));
        return response(criteria);
      }
      if (method === "POST" && path.endsWith("/dependencies")) {
        const dependency = {
          id: "dependency-3",
          project_id: "project-1",
          ...(body as {
            blocking_feature_id: string;
            blocked_feature_id: string;
          }),
          created_at: "2026-01-01T00:00:02Z",
          updated_at: "2026-01-01T00:00:02Z",
        };
        dependencies = [...dependencies, dependency];
        return response(dependency, 201);
      }
      return response([]);
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/features/feature-1"]}>
        <Routes>
          <Route
            element={
              <FeatureDetailPage
                onOpenPalette={() => undefined}
                workspace={workspace}
              />
            }
            path="/projects/:projectId/features/:featureId"
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Edit feature" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Feature title"), {
      target: { value: "Edited feature" },
    });
    fireEvent.change(screen.getByLabelText("Feature description"), {
      target: { value: "Edited description" },
    });
    fireEvent.change(screen.getByLabelText("Feature goal"), {
      target: { value: "Edited goal" },
    });
    fireEvent.change(screen.getByLabelText("Feature priority"), {
      target: { value: "critical" },
    });
    fireEvent.change(screen.getByLabelText("Feature state"), {
      target: { value: "ready" },
    });
    fireEvent.change(screen.getByLabelText("Feature epic"), {
      target: { value: "epic-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save feature" }));
    expect(
      await screen.findByText("temporary feature failure"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save feature" }));
    await waitFor(() =>
      expect(featureState).toMatchObject({
        title: "Edited feature",
        priority: "critical",
        status: "ready",
        epic_id: "epic-1",
      }),
    );
    fireEvent.change(screen.getByLabelText("Feature epic"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save feature" }));
    await waitFor(() => expect(featureState.epic_id).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Edit task Task one" }));
    fireEvent.change(screen.getByLabelText("Task title for Task one"), {
      target: { value: "Edited task" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(tasks[0].title).toBe("Edited task"));
    fireEvent.click(
      screen.getByRole("button", { name: "Move task Edited task down" }),
    );
    await waitFor(() => expect(tasks[0].id).toBe("task-2"));

    fireEvent.click(
      screen.getByRole("button", { name: "Edit criterion Criterion one" }),
    );
    fireEvent.change(
      screen.getByLabelText("Criterion description for Criterion one"),
      { target: { value: "Edited criterion" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(criteria[0].description).toBe("Edited criterion"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Mark satisfied: Edited criterion/ }),
    );
    await waitFor(() => expect(criteria[0].satisfied).toBe(true));

    expect(
      screen.getByRole("heading", { name: "Blocked by" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Upstream feature/).at(-1)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Blocks" })).toBeInTheDocument();
    expect(
      screen.getAllByText(/Downstream feature/).at(-1),
    ).toBeInTheDocument();
  });

  it("presents an actionable feature summary and keeps archived detail read-only", async () => {
    const task = {
      id: "task-1",
      feature_id: feature.id,
      title: "Persist the plan",
      description: null,
      status: "todo",
      position: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const criterion = {
      id: "criterion-1",
      feature_id: feature.id,
      description: "The plan is visible",
      satisfied: false,
      position: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const readiness = {
      evaluation_id: null,
      feature_id: feature.id,
      evaluated_at: "2026-01-01T00:00:00Z",
      rule_set_version: "rfx03-v1",
      input_fingerprint: "b".repeat(64),
      outcome: "NOT_READY",
      passed_checks: ["R02", "R04", "R06"],
      failed_checks: ["R01", "R03", "R05"],
      blockers: [],
      results: [
        { rule_id: "R01", rule_version: "1", result: "failed", explanation: "Define the feature.", blockers: [], references: [] },
        { rule_id: "R02", rule_version: "1", result: "passed", explanation: "Criteria exist.", blockers: [], references: [] },
        { rule_id: "R03", rule_version: "1", result: "failed", explanation: "Resolve dependencies.", blockers: [], references: [] },
        { rule_id: "R04", rule_version: "1", result: "passed", explanation: "No linked decisions are blocking readiness.", blockers: [], references: [] },
        { rule_id: "R05", rule_version: "1", result: "failed", explanation: "Review invariants.", blockers: [], references: [] },
        { rule_id: "R06", rule_version: "1", result: "passed", explanation: "The project is active.", blockers: [], references: [] },
      ],
      stale: false,
    };
    let currentProject = {
      ...project,
      status: project.status as string,
      archived_at: project.archived_at as string | null,
    };
    vi.mocked(globalThis.fetch).mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/projects/project-1") && !url.includes("/features/")) return response(currentProject);
      if (url.endsWith("/features/feature-1")) return response(feature);
      if (url.endsWith("/epics")) return response([]);
      if (url.endsWith("/tasks")) return response([task]);
      if (url.endsWith("/acceptance-criteria")) return response([criterion]);
      if (url.endsWith("/dependencies")) return response([]);
      if (url.includes("/features") && !url.includes("/readiness/")) return response([feature]);
      if (url.endsWith("/readiness/preview")) return response(readiness);
      if (url.endsWith("/readiness/evaluations")) return response([]);
      if (url.includes("/invariants")) return response([]);
      if (url.includes("/decisions")) return response([]);
      return response([]);
    });

    const renderDetail = () =>
      render(
        <MemoryRouter initialEntries={["/projects/project-1/features/feature-1"]}>
          <Routes>
            <Route
              element={<FeatureDetailPage onOpenPalette={() => undefined} workspace={workspace} />}
              path="/projects/:projectId/features/:featureId"
            />
          </Routes>
        </MemoryRouter>,
      );

    renderDetail();
    expect(await screen.findByRole("heading", { name: "Edit feature" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Feature detail sections" })).toBeInTheDocument();
    expect(await screen.findByText("3 / 6 rules passed")).toBeInTheDocument();
    cleanup();
    currentProject = { ...project, status: "archived", archived_at: "2026-01-02T00:00:00Z" };
    renderDetail();

    expect(await screen.findByText(/Archived project.*read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save feature" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "New task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "New acceptance criterion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add dependency" })).not.toBeInTheDocument();
    expect(screen.getByText("Persist the plan")).toBeInTheDocument();
    expect(screen.getByText("The plan is visible")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Evaluate & save" })).not.toBeInTheDocument();
  });

  it("uses the current feature evaluation for readiness and dependency counts", async () => {
    const readyReadiness = {
      evaluation_id: null,
      feature_id: feature.id,
      evaluated_at: "2026-01-01T00:00:00Z",
      rule_set_version: "rfx03-v1",
      input_fingerprint: "c".repeat(64),
      outcome: "READY_TO_START",
      passed_checks: ["R01", "R02", "R03", "R04", "R05", "R06"],
      failed_checks: [],
      blockers: [],
      results: ["R01", "R02", "R03", "R04", "R05", "R06"].map((rule_id) => ({
        rule_id,
        rule_version: "1",
        result: "passed",
        explanation: "Rule passed.",
        blockers: [],
        references: [],
      })),
      stale: false,
    };
    const incomingDependency = {
      id: "dependency-1",
      project_id: project.id,
      blocking_feature_id: "feature-2",
      blocked_feature_id: feature.id,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    vi.mocked(globalThis.fetch).mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/projects/project-1") && !url.includes("/features/")) return response(project);
      if (url.endsWith("/features/feature-1")) return response(feature);
      if (url.endsWith("/epics")) return response([]);
      if (url.endsWith("/tasks")) return response([]);
      if (url.endsWith("/acceptance-criteria")) return response([]);
      if (url.endsWith("/dependencies")) return response([incomingDependency]);
      if (url.includes("/features") && !url.includes("/readiness/")) return response([feature]);
      if (url.endsWith("/readiness/preview")) return response(readyReadiness);
      if (url.endsWith("/readiness/evaluations")) return response([]);
      if (url.includes("/invariants")) return response([]);
      if (url.includes("/decisions")) return response([]);
      return response([]);
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/features/feature-1"]}>
        <Routes>
          <Route
            element={<FeatureDetailPage onOpenPalette={() => undefined} workspace={workspace} />}
            path="/projects/:projectId/features/:featureId"
          />
        </Routes>
      </MemoryRouter>,
    );

    const summary = await screen.findByRole("region", { name: "Feature planning summary" });
    await waitFor(() => expect(summary).toHaveTextContent("READY TO START"));
    expect(summary).toHaveTextContent("READY TO START");
    expect(within(summary).getByText("Blocked dependencies").parentElement).toHaveTextContent("0");
  });

  it("does not show another feature's readiness in the feature summary", async () => {
    const foreignReadiness = {
      evaluation_id: null,
      feature_id: "feature-2",
      evaluated_at: "2026-01-01T00:00:00Z",
      rule_set_version: "rfx03-v1",
      input_fingerprint: "d".repeat(64),
      outcome: "READY_TO_START",
      passed_checks: ["R01", "R02", "R03", "R04", "R05", "R06"],
      failed_checks: [],
      blockers: [],
      results: [],
      stale: false,
    };
    vi.mocked(globalThis.fetch).mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/projects/project-1") && !url.includes("/features/")) return response(project);
      if (url.endsWith("/features/feature-1")) return response(feature);
      if (url.endsWith("/epics")) return response([]);
      if (url.endsWith("/tasks")) return response([]);
      if (url.endsWith("/acceptance-criteria")) return response([]);
      if (url.endsWith("/dependencies")) return response([]);
      if (url.includes("/features") && !url.includes("/readiness/")) return response([feature]);
      if (url.endsWith("/readiness/preview")) return response(foreignReadiness);
      if (url.endsWith("/readiness/evaluations")) return response([]);
      if (url.includes("/invariants")) return response([]);
      if (url.includes("/decisions")) return response([]);
      return response([]);
    });

    render(
      <MemoryRouter initialEntries={["/projects/project-1/features/feature-1"]}>
        <Routes>
          <Route
            element={<FeatureDetailPage onOpenPalette={() => undefined} workspace={workspace} />}
            path="/projects/:projectId/features/:featureId"
          />
        </Routes>
      </MemoryRouter>,
    );

    const summary = await screen.findByRole("region", { name: "Feature planning summary" });
    await screen.findByText("UNAVAILABLE");
    expect(summary).toHaveTextContent("Loading preview");
    expect(summary).not.toHaveTextContent("READY TO START");
  });
});
