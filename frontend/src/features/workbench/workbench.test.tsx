import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Handoff } from "../../api";
import {
  HandoffDetailPage,
  RunDetailPage,
  RunInventoryPage,
  WorkbenchPage,
} from "./index";

const workspace = {
  id: "workspace-1",
  name: "Local Workspace",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const run = {
  id: "run-1",
  project_id: "project-1",
  feature_id: "feature-1",
  context_package_id: "package-1",
  context_schema_version: "forge-context-v1",
  context_fingerprint: "a".repeat(64),
  title: "Record a feature run",
  description: null,
  executor_type: "manual",
  executor_label: null,
  status: "PLANNED" as const,
  version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  started_at: null,
  finished_at: null,
};

function response(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("FND-05 Workbench surfaces", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a useful empty Workbench without demo records", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/runs")) return response([]);
      if (url.endsWith("/projects?status=all")) return response([]);
      return response([]);
    });
    render(
      <MemoryRouter>
        <WorkbenchPage onOpenPalette={() => undefined} workspace={workspace} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("NO RUNS RECORDED YET")).toBeInTheDocument();
    expect(screen.getByText("Start with a known Feature")).toBeInTheDocument();
    expect(screen.queryByText("RUN-008")).not.toBeInTheDocument();
  });

  it("ignores an out-of-order run search response", async () => {
    let resolveOld!: (value: Response) => void;
    let resolveNew!: (value: Response) => void;
    const old = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const newer = new Promise<Response>((resolve) => {
      resolveNew = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("search=old")) return old;
      if (url.includes("search=new")) return newer;
      return response([]);
    });
    render(
      <MemoryRouter initialEntries={["/workbench/runs"]}>
        <Routes>
          <Route
            element={
              <RunInventoryPage
                onOpenPalette={() => undefined}
                workspace={workspace}
              />
            }
            path="/workbench/runs"
          />
        </Routes>
      </MemoryRouter>,
    );
    const search = await screen.findByRole("textbox", { name: "Search runs" });
    fireEvent.change(search, { target: { value: "old" } });
    fireEvent.change(search, { target: { value: "new" } });
    resolveNew(
      new Response(
        JSON.stringify([{ ...run, id: "new-run", title: "New run" }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    expect(await screen.findByText("New run")).toBeInTheDocument();
    resolveOld(
      new Response(
        JSON.stringify([{ ...run, id: "old-run", title: "Stale run" }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Stale run")).not.toBeInTheDocument(),
    );
  });

  it("records a timeline event with the current optimistic version", async () => {
    let current = run;
    let events: Array<{
      id: string;
      run_id: string;
      event_type: string;
      title: string;
      description: string;
      origin: string;
      recorded_at: string;
      occurred_at: null;
      supersedes_event_id: null;
    }> = [];
    let outputs: Array<{
      id: string;
      run_id: string;
      label: string;
      summary: string;
      reference_kind: string;
      reference_value: null;
      provenance: string;
      created_at: string;
    }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/runs/run-1") && !init?.method)
        return response(current);
      if (url.endsWith("/runs/run-1/events") && !init?.method)
        return response(events);
      if (url.endsWith("/runs/run-1/outputs") && !init?.method)
        return response(outputs);
      if (url.endsWith("/runs/run-1/events") && init?.method === "POST") {
        current = { ...current, version: current.version + 1 };
        const item = {
          id: "event-1",
          run_id: current.id,
          event_type: "progress",
          title: "Progress",
          description: "Reported",
          origin: "manual",
          recorded_at: current.updated_at,
          occurred_at: null,
          supersedes_event_id: null,
        };
        events = [item];
        return response(item, 201);
      }
      if (url.endsWith("/runs/run-1/outputs") && init?.method === "POST") {
        current = { ...current, version: current.version + 1 };
        const item = {
          id: "output-1",
          run_id: current.id,
          label: "Reported artifact",
          summary: "A declared result",
          reference_kind: "label",
          reference_value: null,
          provenance: "Manual report",
          created_at: current.updated_at,
        };
        outputs = [item];
        return response(item, 201);
      }
      return response([]);
    });
    render(
      <MemoryRouter initialEntries={["/projects/project-1/runs/run-1"]}>
        <Routes>
          <Route
            element={
              <RunDetailPage
                onOpenPalette={() => undefined}
                workspace={workspace}
              />
            }
            path="/projects/:projectId/runs/:runId"
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Record a feature run",
        level: 2,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Add event" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Event title" }), {
      target: { value: "Progress" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Event description" }),
      { target: { value: "Reported" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Report event" }));
    await waitFor(() =>
      expect(screen.getByText("1 events")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Add output" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Output label" }), {
      target: { value: "Reported artifact" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Output summary" }), {
      target: { value: "A declared result" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Output provenance" }),
      { target: { value: "Manual report" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Report output" }));
    await waitFor(() =>
      expect(screen.getByText("Reported artifact")).toBeInTheDocument(),
    );
  });

  it("acknowledges only the visible published revision", async () => {
    let handoff: Handoff = {
      id: "handoff-1",
      project_id: "project-1",
      feature_id: "feature-1",
      run_id: "run-1",
      context_package_id: "package-1",
      title: "Review report",
      summary: "Reported summary",
      outcomes: "Outcome",
      blockers: "None",
      questions: "Question",
      next_actions: "Review",
      references: "",
      status: "READY",
      current_revision: 1,
      version: 3,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      ready_at: "2026-01-01T00:00:00Z",
      acknowledged_at: null,
      withdrawn_at: null,
      published_revision: {
        id: "revision-1",
        handoff_id: "handoff-1",
        revision: 1,
        title: "Review report",
        summary: "Reported summary",
        outcomes: "Outcome",
        blockers: "None",
        questions: "Question",
        next_actions: "Review",
        references: "",
        schema_version: "forge-handoff-v1",
        context_package_id: "package-1",
        context_fingerprint: "b".repeat(64),
        fingerprint: "c".repeat(64),
        payload: { schema: "forge-handoff-v1" },
        markdown: "# Review report",
        created_at: "2026-01-01T00:00:00Z",
      },
      acknowledgement: null,
      acknowledgements: [],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/handoffs/handoff-1") && !init?.method)
        return response(handoff);
      if (url.endsWith("/acknowledge")) {
        const acknowledgement = {
          id: "ack-1",
          handoff_id: "handoff-1",
          revision: 1,
          acknowledged_by: "manual reviewer",
          acknowledged_at: "2026-01-01T00:00:00Z",
        };
        handoff = {
          ...handoff,
          status: "ACKNOWLEDGED",
          version: 4,
          acknowledged_at: "2026-01-01T00:00:00Z",
          acknowledgement,
          acknowledgements: [acknowledgement],
        };
        return response(acknowledgement);
      }
      return response([]);
    });
    render(
      <MemoryRouter initialEntries={["/projects/project-1/handoffs/handoff-1"]}>
        <Routes>
          <Route
            element={
              <HandoffDetailPage
                onOpenPalette={() => undefined}
                workspace={workspace}
              />
            }
            path="/projects/:projectId/handoffs/:handoffId"
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Review report", level: 2 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() =>
      expect(screen.getByText("ACKNOWLEDGED")).toBeInTheDocument(),
    );
  });

  it("keeps draft text and shows exact READY fields when publication is rejected", async () => {
    const draft: Handoff = {
      id: "handoff-draft",
      project_id: "project-1",
      feature_id: "feature-1",
      run_id: "run-1",
      context_package_id: "package-1",
      title: "Draft report",
      summary: "",
      outcomes: "",
      blockers: "",
      questions: "",
      next_actions: "",
      references: "",
      status: "DRAFT",
      current_revision: 0,
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      ready_at: null,
      acknowledged_at: null,
      withdrawn_at: null,
      published_revision: null,
      acknowledgement: null,
      acknowledgements: [],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/handoffs/handoff-draft") && !init?.method)
        return response(draft);
      if (url.endsWith("/revisions") && !init?.method) return response([]);
      if (url.endsWith("/handoffs/handoff-draft") && init?.method === "PATCH")
        return response({
          ...draft,
          version: 2,
          summary: "   ",
          next_actions: "\t",
        });
      if (url.endsWith("/ready"))
        return response(
          {
            detail:
              "Handoff cannot be marked READY; missing fields: summary, next_actions",
          },
          422,
        );
      return response([]);
    });
    render(
      <MemoryRouter
        initialEntries={["/projects/project-1/handoffs/handoff-draft"]}
      >
        <Routes>
          <Route
            element={
              <HandoffDetailPage
                onOpenPalette={() => undefined}
                workspace={workspace}
              />
            }
            path="/projects/:projectId/handoffs/:handoffId"
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "What should the next person know?",
        level: 2,
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "summary" }), {
      target: { value: "  Keep this written value  " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "next_actions" }), {
      target: { value: "Review the report" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
    expect(
      await screen.findByText(
        "Handoff cannot be marked READY; missing fields: summary, next_actions",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "summary" })).toHaveValue(
      "  Keep this written value  ",
    );
    expect(screen.getByRole("textbox", { name: "next_actions" })).toHaveValue(
      "Review the report",
    );
  });

  it("shows immutable revision history and historical acknowledgement state", async () => {
    const revision = (number: number, summary: string) => ({
      id: `revision-${number}`,
      handoff_id: "handoff-history",
      revision: number,
      title: "History report",
      summary,
      outcomes: "Outcome",
      blockers: "None",
      questions: "Question",
      next_actions: "Review",
      references: "",
      schema_version: "forge-handoff-v1",
      context_package_id: "package-1",
      context_fingerprint: "b".repeat(64),
      fingerprint: String(number).repeat(64),
      payload: { schema: "forge-handoff-v1" },
      markdown: `# ${summary}`,
      created_at: `2026-01-0${number}T00:00:00Z`,
    });
    const revisions = [
      revision(1, "Revision one summary"),
      revision(2, "Revision two summary"),
    ];
    const acknowledgement = {
      id: "ack-history",
      handoff_id: "handoff-history",
      revision: 1,
      acknowledged_by: "reviewer",
      acknowledged_at: "2026-01-03T00:00:00Z",
    };
    const history: Handoff = {
      id: "handoff-history",
      project_id: "project-1",
      feature_id: "feature-1",
      run_id: "run-1",
      context_package_id: "package-1",
      title: "History report",
      summary: "Revision two summary",
      outcomes: "Outcome",
      blockers: "None",
      questions: "Question",
      next_actions: "Review",
      references: "",
      status: "READY",
      current_revision: 2,
      version: 5,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      ready_at: "2026-01-02T00:00:00Z",
      acknowledged_at: null,
      withdrawn_at: null,
      published_revision: revisions[1],
      acknowledgement: null,
      acknowledgements: [acknowledgement],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/handoffs/handoff-history")) return response(history);
      if (url.endsWith("/revisions")) return response(revisions);
      return response([]);
    });
    render(
      <MemoryRouter
        initialEntries={["/projects/project-1/handoffs/handoff-history"]}
      >
        <Routes>
          <Route
            element={
              <HandoffDetailPage
                onOpenPalette={() => undefined}
                workspace={workspace}
              />
            }
            path="/projects/:projectId/handoffs/:handoffId"
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: /Revision 2.*Current/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Revision two summary", level: 2 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Revision 1/ }));
    expect(
      await screen.findByRole("heading", {
        name: "Revision one summary",
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Acknowledged by reviewer/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Download revision 1 as JSON" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/revisions/1/download?format=json"),
    );
  });
});
