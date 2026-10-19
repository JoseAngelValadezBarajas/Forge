import { describe, expect, test } from "vitest";
import { ApiError, transferErrorMessage } from "./errors";

describe("project transfer error normalization", () => {
  test.each([
    [new ApiError(422, "schema validation failed"), "invalid-document"],
    [new ApiError(422, "dependency reference is unknown"), "invalid-reference"],
    [new ApiError(409, "project already exists"), "duplicate-project"],
    [new Error("desktop API route unavailable"), "desktop-bridge"],
    [new ApiError(503, "backend unavailable"), "backend"],
    [new TypeError("Failed to fetch"), "unavailable"],
  ] as const)("classifies %s as %s", (cause, kind) => {
    expect(transferErrorMessage(cause).kind).toBe(kind);
  });

  test("never exposes request bodies or session capabilities", () => {
    const result = transferErrorMessage(
      new Error("desktop bridge rejected Bearer abcdef0123456789 request body={name:secret}"),
    );
    expect(result.message).not.toContain("Bearer");
    expect(result.message).not.toContain("secret");
  });
});
