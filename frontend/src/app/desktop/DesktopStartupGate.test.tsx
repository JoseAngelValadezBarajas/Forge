import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, isTauri: isTauriMock }));

import { DesktopStartupGate } from "./DesktopStartupGate";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  invokeMock.mockReset();
});

describe("DesktopStartupGate", () => {
  test("does not gate the existing browser runtime", () => {
    isTauriMock.mockReturnValue(false);
    render(<DesktopStartupGate><div>Browser application</div></DesktopStartupGate>);
    expect(screen.getByText("Browser application")).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("waits for Rust readiness before mounting the application", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockResolvedValueOnce({ state: "starting" }).mockResolvedValueOnce({ state: "ready" });

    render(<DesktopStartupGate><div>Workspace request owner</div></DesktopStartupGate>);
    expect(screen.getByRole("status")).toHaveTextContent("Starting Forge local service");
    expect(screen.queryByText("Workspace request owner")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Workspace request owner")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledWith("desktop_runtime_status");
  });

  test("shows a safe failure and retries through the scoped desktop command", async () => {
    isTauriMock.mockReturnValue(true);
    let statusCalls = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "desktop_retry_start") return Promise.resolve(undefined);
      statusCalls += 1;
      return Promise.resolve(statusCalls === 1
        ? { state: "failed", message: "Forge could not start its local service." }
        : { state: "ready" });
    });

    render(<DesktopStartupGate><div>Workspace</div></DesktopStartupGate>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Forge could not start its local service.");
    expect(screen.getByText(/%LOCALAPPDATA%\\Forge\\logs\\forge-desktop\.log/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry local service" }));

    await waitFor(() => expect(screen.getByText("Workspace")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledWith("desktop_retry_start");
  });
});
