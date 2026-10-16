import { describe, expect, test } from "vitest";
import { forgeApi } from "./api";
import { apiMethodInventory } from "./test/api-contract-harness";

describe("stable forgeApi public surface", () => {
  test("retains all 94 operations in their original composition order", () => {
    const expected = Object.values(apiMethodInventory).flat();
    expect(expected).toHaveLength(94);
    expect(Object.keys(forgeApi)).toEqual(expected);
  });
});
