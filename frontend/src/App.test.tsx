import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

function renderApp() {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
}

describe("Forge app shell", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("starts with a useful empty workspace", () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByText("Your workspace is ready")).toBeInTheDocument();
    expect(screen.getByText("No local projects connected")).toBeInTheDocument();
  });

  it("navigates through the local command palette", () => {
    renderApp();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Go to Projects/i }));
    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
  });

  it("supports arrow and Enter navigation without a mouse", () => {
    renderApp();
    const trigger = screen.getByRole("button", { name: /Search or command/ });
    trigger.focus();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Go to Projects/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("heading", { name: /^Projects$/ })).toBeInTheDocument();
  });

  it("announces empty results and restores focus after Escape", async () => {
    renderApp();
    const trigger = screen.getByRole("button", { name: /Search or command/ });
    trigger.focus();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.change(input, { target: { value: "does-not-exist" } });
    expect(screen.getByRole("status")).toHaveTextContent("No commands match");
    fireEvent.keyDown(input, { key: "Escape" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(trigger);
  });

  it("toggles light mode", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Dark mode" })).toBeInTheDocument();
  });
});

