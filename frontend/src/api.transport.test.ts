import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, forgeApi } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("existing HTTP transport behavior", () => {
  test.each([400, 404, 409, 500])("maps HTTP %s and preserves the backend detail", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: `server detail ${status}` }), { status }),
    ));

    await expect(forgeApi.listWorkspaces()).rejects.toMatchObject({
      name: "ApiError",
      status,
      message: `server detail ${status}`,
    });
  });

  test("joins validation detail messages with semicolons", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: [{ msg: "name required" }, { msg: "too long" }] }), { status: 422 }),
    ));

    await expect(forgeApi.listWorkspaces()).rejects.toMatchObject({
      status: 422,
      message: "name required; too long",
    });
  });

  test("uses the stable fallback for non-JSON HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("proxy failure", { status: 502 })));

    await expect(forgeApi.listWorkspaces()).rejects.toEqual(
      new ApiError(502, "Forge could not complete that request."),
    );
  });

  test("uses the stable fallback when an HTTP error body is malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{", { status: 500 })));

    await expect(forgeApi.listWorkspaces()).rejects.toMatchObject({
      status: 500,
      message: "Forge could not complete that request.",
    });
  });

  test("returns undefined for HTTP 204 without attempting JSON parsing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(forgeApi.deleteDependency("w1", "p1", "d1")).resolves.toBeUndefined();
  });

  test("preserves success-response JSON parse failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));

    await expect(forgeApi.listWorkspaces()).rejects.toBeInstanceOf(SyntaxError);
  });

  test("passes through unexpected JSON response shapes without runtime validation", async () => {
    const unexpectedShape = { workspaces: "not-an-array" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(unexpectedShape), { status: 200 }),
    ));

    await expect(forgeApi.listWorkspaces()).resolves.toEqual(unexpectedShape);
  });

  test("propagates the original network error", async () => {
    const networkFailure = new TypeError("offline");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkFailure));

    await expect(forgeApi.listWorkspaces()).rejects.toBe(networkFailure);
  });

  test("propagates abort rejection from fetch", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));

    await expect(forgeApi.getProject("w1", "p1", controller.signal)).rejects.toBe(aborted);
  });

  test("an abort after dispatch rejects the pending operation", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = forgeApi.getProject("w1", "p1", controller.signal);
    expect(fetchMock).toHaveBeenCalledOnce();
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
