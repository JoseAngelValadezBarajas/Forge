import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("button", { name: /Go to Projects/i }));
    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
  });

  it("toggles light mode", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Dark mode" })).toBeInTheDocument();
  });
});

