import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}));

import { downloadFile, request } from "./client";
import { ApiError } from "./errors";

function desktopResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    contentType: headers["content-type"] ?? "application/json",
    contentDisposition: headers["content-disposition"] ?? null,
    bodyBase64: btoa(JSON.stringify(body)),
  };
}

beforeEach(() => {
  isTauriMock.mockReturnValue(true);
  invokeMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("desktop API transport", () => {
  test("dispatches a constrained request through Rust without exposing transport headers", async () => {
    invokeMock.mockResolvedValue(desktopResponse(201, { id: "w1" }));

    await expect(request<{ id: string }>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "Alpha" }),
    })).resolves.toEqual({ id: "w1" });

    expect(invokeMock).toHaveBeenCalledWith("desktop_api_request", {
      request: expect.objectContaining({
        method: "POST",
        path_and_query: "/api/workspaces",
        body: JSON.stringify({ name: "Alpha" }),
      }),
    });
    expect(JSON.stringify(invokeMock.mock.calls)).not.toMatch(/authorization|127\.0\.0\.1|session_secret/i);
  });

  test("preserves backend error status and detail", async () => {
    invokeMock.mockResolvedValue(desktopResponse(409, { detail: "Workspace conflict" }));

    await expect(request("/workspaces")).rejects.toEqual(new ApiError(409, "Workspace conflict"));
  });

  test("preserves no-content responses", async () => {
    invokeMock.mockResolvedValue({ status: 204, contentType: null, contentDisposition: null, bodyBase64: "" });

    await expect(request("/workspaces/w1")).resolves.toBeUndefined();
  });

  test("cancels the Rust-owned request when its AbortSignal aborts", async () => {
    let finishRequest: ((value: unknown) => void) | undefined;
    invokeMock.mockImplementation((command: string) => {
      if (command === "desktop_api_request") {
        return new Promise((resolve) => { finishRequest = resolve; });
      }
      return Promise.resolve(true);
    });
    const controller = new AbortController();

    const pending = request("/workspaces", { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledWith("desktop_cancel_api_request", {
      requestId: expect.any(String),
    }));
    finishRequest?.(desktopResponse(200, []));
  });

  test("retains the browser fetch transport", async () => {
    isTauriMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "w2" })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/workspaces")).resolves.toEqual({ id: "w2" });
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces", expect.any(Object));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("preserves downloaded bytes and sanitizes the backend filename", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      contentDisposition: 'attachment; filename="../../report.txt"',
      bodyBase64: btoa("download bytes"),
    });
    const createObjectUrl = vi.fn().mockReturnValue("blob:forge-test");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    let downloadedName = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download;
    });

    await downloadFile("/api/workspaces/w1/export", "fallback.txt");
    expect(downloadedName).toBe("report.txt");
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(invokeMock).toHaveBeenCalledWith("desktop_api_request", {
      request: expect.objectContaining({ path_and_query: "/api/workspaces/w1/export", method: "GET" }),
    });
    vi.runOnlyPendingTimers();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:forge-test");
    click.mockRestore();
    vi.useRealTimers();
  });
});
