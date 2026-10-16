import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertNoSourcePathLeak,
  assertTreeNoSourcePathLeak,
  assertBuildPrerequisites,
  findNsiInstaller,
  resolveGeneratedPath,
  sha256File,
} from "./desktop-build-utils.mjs";

test("generated paths must stay inside the repository", () => {
  const root = path.join(os.tmpdir(), "forge-project");
  assert.equal(resolveGeneratedPath(root, "desktop/src-tauri/resources/forge-sidecar"), path.join(root, "desktop/src-tauri/resources/forge-sidecar"));
  assert.throws(() => resolveGeneratedPath(root, "../../outside"), /child of the repository/);
  assert.throws(() => resolveGeneratedPath(root, "."), /child of the repository/);
});

test("build prerequisites fail explicitly for unsupported hosts or missing tools", () => {
  assert.throws(() => assertBuildPrerequisites({
    platform: "linux",
    architecture: "x64",
    requiredCommands: ["cargo"],
    availableCommands: ["cargo"],
  }), /requires Windows x64/);
  assert.throws(() => assertBuildPrerequisites({
    platform: "win32",
    architecture: "x64",
    requiredCommands: ["cargo", "makensis"],
    availableCommands: ["cargo"],
  }), /makensis/);
});

test("NSIS artifact discovery requires exactly one installer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forge-installer-test-"));
  try {
    await mkdir(path.join(root, "nsis"));
    await writeFile(path.join(root, "nsis", "Forge_0.1.0_x64-setup.exe"), "installer");
    assert.equal(await findNsiInstaller(root), path.join(root, "nsis", "Forge_0.1.0_x64-setup.exe"));
    await writeFile(path.join(root, "nsis", "another-setup.exe"), "second");
    await assert.rejects(findNsiInstaller(root), /found 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact checksum is deterministic and checkout paths are rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forge-artifact-test-"));
  try {
    const artifact = path.join(root, "Forge-setup.exe");
    await writeFile(artifact, "forge test artifact");
    assert.equal(await sha256File(artifact), "69546878c138f92c480010913cb0f29de1c400de8f025d86b35c64452e0e06ac");
    assert.doesNotThrow(() => assertNoSourcePathLeak("resource payload", path.join(root, "source")));
    assert.throws(() => assertNoSourcePathLeak(`path=${root}`, root), /source checkout path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("binary runtime files cannot embed the developer checkout path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forge-runtime-path-test-"));
  try {
    const runtime = path.join(root, "runtime");
    await mkdir(runtime);
    await writeFile(path.join(runtime, "clean.bin"), Buffer.from([0, 1, 2, 3]));
    await assertTreeNoSourcePathLeak(runtime, path.join(root, "source"));
    await writeFile(path.join(runtime, "path.bin"), Buffer.from(`embedded=${path.join(root, "source")}`, "utf16le"));
    await assert.rejects(assertTreeNoSourcePathLeak(runtime, path.join(root, "source")), /source checkout path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
