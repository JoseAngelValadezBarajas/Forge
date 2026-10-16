import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  cleanupRunResourceDirectory,
  createRunResourceDirectory,
} from "../e2e/run-resources.mjs";

const testParents = new Set();

afterEach(() => {
  for (const directory of testParents) rmSync(directory, { recursive: true, force: true });
  testParents.clear();
});

test("cleanup removes only the resource directory created for this invocation", () => {
  const parent = mkdtempSync(join(tmpdir(), "forge-e2e-resource-test-"));
  testParents.add(parent);
  const ownedDirectory = createRunResourceDirectory(parent);
  const concurrentDirectory = createRunResourceDirectory(parent);
  const unrelatedMatchingFile = join(parent, "forge-rfx-org03c-e2e-unrelated.db");
  mkdirSync(join(ownedDirectory, "nested"));
  writeFileSync(join(ownedDirectory, "nested", "owned.db"), "owned");
  writeFileSync(join(concurrentDirectory, "other.db"), "other invocation");
  writeFileSync(unrelatedMatchingFile, "pre-existing matching filename");

  cleanupRunResourceDirectory(ownedDirectory, parent);

  assert.equal(existsSync(ownedDirectory), false);
  assert.equal(existsSync(join(concurrentDirectory, "other.db")), true);
  assert.equal(existsSync(unrelatedMatchingFile), true);
});

test("cleanup refuses a matching filename that is not an owned run directory", () => {
  const parent = mkdtempSync(join(tmpdir(), "forge-e2e-resource-test-"));
  testParents.add(parent);
  const unrelatedFile = join(parent, "forge-rfx-org03c-e2e-do-not-delete.db");
  writeFileSync(unrelatedFile, "preserve");

  assert.throws(() => cleanupRunResourceDirectory(unrelatedFile, parent));
  assert.equal(existsSync(unrelatedFile), true);
});
