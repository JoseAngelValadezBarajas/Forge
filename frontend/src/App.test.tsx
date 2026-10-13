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
});
