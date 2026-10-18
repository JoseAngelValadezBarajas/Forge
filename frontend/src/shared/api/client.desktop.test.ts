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
import { desktopApiFetch } from "./desktopTransport";

function desktopResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    contentType: headers["content-type"] ?? "application/json",
    contentDisposition: headers["content-disposition"] ?? null,
    bodyBase64: btoa(JSON.stringify(body)),
  };
}

async function captureDownloadedFilename(contentDisposition: string | null, fallback = "fallback.txt") {
  vi.useFakeTimers();
  invokeMock.mockResolvedValue({
    status: 200,
    contentType: "application/octet-stream",
    contentDisposition,
    bodyBase64: btoa("download bytes"),
  });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:forge-test") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  let downloadedName = "";
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloadedName = this.download;
  });
  try {
    await downloadFile("/api/export", fallback);
    return downloadedName;
  } finally {
    click.mockRestore();
    vi.runOnlyPendingTimers();
  }
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

  test("formats validation error arrays without losing the backend status", async () => {
    invokeMock.mockResolvedValue(desktopResponse(422, {
      detail: [{ msg: "name is required" }, { msg: "project is invalid" }],
    }));

    await expect(request("/workspaces")).rejects.toEqual(
      new ApiError(422, "name is required; project is invalid"),
    );
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

  test("uses the fallback filename when Content-Disposition is absent or has no filename", async () => {
    await expect(captureDownloadedFilename(null)).resolves.toBe("fallback.txt");
    await expect(captureDownloadedFilename("attachment")).resolves.toBe("fallback.txt");
  });

  test("decodes RFC 5987 filenames and sanitizes reserved Windows filenames", async () => {
    await expect(captureDownloadedFilename("attachment; filename*=UTF-8''caf%C3%A9.txt"))
      .resolves.toBe("café.txt");
    await expect(captureDownloadedFilename('attachment; filename="CON.txt"'))
      .resolves.toBe("_CON.txt");
    await expect(captureDownloadedFilename('attachment; filename="report?.txt"'))
      .resolves.toBe("report_.txt");
  });

  test("falls back for empty and dot-only filenames and bounds long names", async () => {
    for (const filename of ["", ".", ".."]) {
      await expect(captureDownloadedFilename(`attachment; filename="${filename}"`))
        .resolves.toBe("fallback.txt");
    }
    await expect(captureDownloadedFilename(`attachment; filename=${"a".repeat(200)}`))
      .resolves.toHaveLength(180);
  });

  test("preserves download error status and backend detail", async () => {
    invokeMock.mockResolvedValue(desktopResponse(404, { detail: "Export was not found" }));

    await expect(downloadFile("/api/export")).rejects.toEqual(
      new ApiError(404, "Export was not found"),
    );
  });

  test("rejects direct desktop transport outside Tauri", async () => {
    isTauriMock.mockReturnValue(false);

    await expect(desktopApiFetch("/api/workspaces")).rejects.toThrow(
      "Desktop API transport is only available in Forge Desktop.",
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("rejects an already-aborted desktop request before invoking Rust", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(desktopApiFetch("/api/workspaces", { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("rejects non-JSON desktop request bodies", async () => {
    await expect(desktopApiFetch("/api/workspaces", { body: new Blob(["not JSON"]) }))
      .rejects.toThrow("Forge Desktop API requests must use a JSON string body.");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("does not invoke Rust if the signal aborts before IPC dispatch", async () => {
    const mutableSignal = {
      aborted: false,
      addEventListener() { mutableSignal.aborted = true; },
      removeEventListener: vi.fn(),
    };
    const signal = mutableSignal as unknown as AbortSignal;

    await expect(desktopApiFetch("/api/workspaces", { signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
