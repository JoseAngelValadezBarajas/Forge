import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

const workspaces = [
  { id: "ws-1", name: "Local Workspace", description: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "ws-2", name: "Research", description: "Notes", created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
];

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderApp() {
  return render(<BrowserRouter><App /></BrowserRouter>);
}

describe("Forge workspace and project shell", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/workspaces") && !init?.method) return jsonResponse(workspaces);
      if (url.includes("/projects")) return jsonResponse([]);
      if (init?.method === "POST" && url.endsWith("/workspaces")) return jsonResponse({ ...workspaces[1], id: "ws-new", name: "New Workspace" }, 201);
      return jsonResponse({});
    });
  });

  it("loads the selected workspace from the backend and shows real empty state", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByText("Your workspace is ready")).toBeInTheDocument();
    expect(screen.getByText("Local Workspace")).toBeInTheDocument();
  });

  it("switches workspace and persists the active selection", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "Workspace" });
    fireEvent.click(screen.getByRole("button", { name: /Local Workspace/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Research/ }));
    await waitFor(() => expect(window.localStorage.getItem("forge-active-workspace")).toBe("ws-2"));
    expect(screen.getByRole("button", { name: /Research/ })).toBeInTheDocument();
  });

  it("creates a workspace from the accessible switcher", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "Workspace" });
    fireEvent.click(screen.getByRole("button", { name: /Local Workspace/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Create workspace/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Space" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(window.localStorage.getItem("forge-active-workspace")).toBe("ws-new"));
    expect(screen.getByRole("button", { name: /New Workspace/ })).toBeInTheDocument();
  });

  it("navigates to projects and creates a command palette entry", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "Workspace" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Create project/i }));
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create project" })).toBeInTheDocument();
  });

  it("supports keyboard navigation, focus restoration and themes", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "Workspace" });
    const trigger = screen.getByRole("button", { name: /Search or command/ });
    trigger.focus();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.change(input, { target: { value: "does-not-exist" } });
    expect(screen.getByRole("status")).toHaveTextContent("No commands match");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(screen.getByRole("button", { name: "Light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("returns home and ignores an out-of-order project response after switching workspace", async () => {
    window.history.pushState({}, "", "/projects");
    const localProjects = deferred<Response>();
    const researchProjects = deferred<Response>();
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/workspaces") && !init?.method) return jsonResponse(workspaces);
      if (url.includes("/workspaces/ws-1/projects")) return localProjects.promise;
      if (url.includes("/workspaces/ws-2/projects")) return researchProjects.promise;
      return jsonResponse([]);
    });

    renderApp();
    expect(await screen.findByRole("heading", { name: "Projects", level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Local Workspace/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Research/ }));
    expect(window.location.pathname).toBe("/");
    expect(await screen.findByRole("heading", { name: "Workspace", level: 1 })).toBeInTheDocument();
    researchProjects.resolve(new Response(JSON.stringify([
      { id: "research-project", workspace_id: "ws-2", name: "Research Project", description: null, status: "active", created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", archived_at: null },
    ]), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(screen.queryByRole("heading", { name: "Research Project", level: 3 })).not.toBeInTheDocument();
    localProjects.resolve(new Response(JSON.stringify([
      { id: "local-project", workspace_id: "ws-1", name: "Stale Local Project", description: null, status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", archived_at: null },
    ]), { status: 200, headers: { "Content-Type": "application/json" } }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Stale Local Project", level: 3 })).not.toBeInTheDocument());
  });

  it("ignores an out-of-order response after changing project search", async () => {
    window.history.pushState({}, "", "/projects");
    const oldSearch = deferred<Response>();
    const newSearch = deferred<Response>();
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/workspaces") && !init?.method) return jsonResponse(workspaces);
      if (url.includes("search=old")) return oldSearch.promise;
      if (url.includes("search=new")) return newSearch.promise;
      return jsonResponse([]);
    });

    renderApp();
    expect(await screen.findByRole("heading", { name: "Projects", level: 1 })).toBeInTheDocument();
    const search = screen.getByRole("textbox", { name: "Search projects" });
    fireEvent.change(search, { target: { value: "old" } });
    fireEvent.change(search, { target: { value: "new" } });
    newSearch.resolve(new Response(JSON.stringify([
      { id: "new-project", workspace_id: "ws-1", name: "New Search Project", description: null, status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", archived_at: null },
    ]), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByRole("heading", { name: "New Search Project", level: 3 })).toBeInTheDocument();
    oldSearch.resolve(new Response(JSON.stringify([
      { id: "old-project", workspace_id: "ws-1", name: "Stale Search Project", description: null, status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", archived_at: null },
    ]), { status: 200, headers: { "Content-Type": "application/json" } }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Stale Search Project", level: 3 })).not.toBeInTheDocument());
  });

  it("returns home instead of loading a stale project detail after switching workspace", async () => {
    window.history.pushState({}, "", "/projects/project-1");
    const localProject = deferred<Response>();
    const researchProject = deferred<Response>();
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/workspaces") && !init?.method) return jsonResponse(workspaces);
      if (url.includes("/workspaces/ws-1/projects/project-1")) return localProject.promise;
      if (url.includes("/workspaces/ws-2/projects/project-1")) return researchProject.promise;
      return jsonResponse([]);
    });

    renderApp();
    expect(await screen.findByRole("button", { name: /Local Workspace/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Local Workspace/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Research/ }));
    expect(window.location.pathname).toBe("/");
    expect(await screen.findByRole("heading", { name: "Workspace", level: 1 })).toBeInTheDocument();
    researchProject.resolve(new Response(JSON.stringify({
      id: "project-1", workspace_id: "ws-2", name: "Research Detail", description: null, status: "active", created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", archived_at: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(screen.queryByRole("heading", { name: "Research Detail", level: 2 })).not.toBeInTheDocument();
    localProject.resolve(new Response(JSON.stringify({
      id: "project-1", workspace_id: "ws-1", name: "Stale Local Detail", description: null, status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", archived_at: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Stale Local Detail", level: 2 })).not.toBeInTheDocument());
  });

  it("confirms archive, exposes pending/error state and recovers", async () => {
    window.history.pushState({}, "", "/projects/project-1");
    const project = { id: "project-1", workspace_id: "ws-1", name: "Archive Me", description: "Test project", status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", archived_at: null };
    const archiveAttempt = deferred<Response>();
    let archiveCalls = 0;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/workspaces") && !init?.method) return jsonResponse([workspaces[0]]);
      if (url.endsWith("/projects/project-1") && !init?.method) return jsonResponse(project);
      if (url.endsWith("/archive")) {
        archiveCalls += 1;
        if (archiveCalls === 1) return archiveAttempt.promise;
        if (archiveCalls === 2) return Promise.reject(new Error("archive service unavailable"));
        return jsonResponse({ ...project, status: "archived", archived_at: "2026-01-03T00:00:00Z" });
      }
      return jsonResponse({});
    });

    renderApp();
    expect(await screen.findByRole("heading", { name: "Archive Me", level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("button", { name: "Archiving…" })).toBeDisabled();
    archiveAttempt.reject(new Error("archive service unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("archive service unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("archive service unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Project archived.");
    expect(screen.getByText("archived", { exact: true })).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledTimes(3);
  });
});
