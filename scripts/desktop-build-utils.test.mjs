import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertNoSourcePathLeak,
  assertTreeNoSourcePathLeak,
  assertBuildPrerequisites,
  createInstalledAppEnvironment,
  createInstalledDiagnosticPaths,
  downloadDirectories,
  describeInstalledSmokeFailure,
  findNsiInstaller,
  resolveGeneratedPath,
  sha256File,
} from "./desktop-build-utils.mjs";

test("desktop Rust tests and installer build require the committed Cargo lockfile", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const [lockfile, workflow, buildScript] = await Promise.all([
    readFile(path.join(root, "desktop/src-tauri/Cargo.lock"), "utf8"),
    readFile(path.join(root, ".github/workflows/desktop-windows.yml"), "utf8"),
    readFile(path.join(root, "scripts/run_desktop.mjs"), "utf8"),
  ]);

  assert.match(lockfile, /^version = 4/m);
  assert.match(lockfile, /\[\[package\]\]\nname = "forge-desktop"\nversion = "0\.1\.0"\n/);
  assert.doesNotMatch(workflow, /cargo\s+generate-lockfile/);
  assert.match(workflow, /cargo test --manifest-path desktop\/src-tauri\/Cargo\.toml --locked/);
  assert.match(workflow, /cargo clippy --manifest-path desktop\/src-tauri\/Cargo\.toml --locked/);
  assert.match(workflow, /cargo metadata --manifest-path desktop\/src-tauri\/Cargo\.toml --locked/);
  assert.match(buildScript, /"--",\s*"--locked"/);
});

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

test("installed smoke launches the production app without WebView debugging overrides", () => {
  const parentEnvironment = {
    PATH: "runner-path",
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=43127",
    WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER: "\\\\.\\pipe\\inherited-debugger",
  };

  const childEnvironment = createInstalledAppEnvironment(parentEnvironment, "C:\\temp\\forge-profile");

  assert.equal(childEnvironment.PATH, "runner-path");
  assert.equal(childEnvironment.WEBVIEW2_USER_DATA_FOLDER, "C:\\temp\\forge-profile");
  assert.equal("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS" in childEnvironment, false);
  assert.equal("WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER" in childEnvironment, false);
  assert.equal(parentEnvironment.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, "--remote-debugging-port=43127");
  assert.equal(parentEnvironment.WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER, "\\\\.\\pipe\\inherited-debugger");
  assert.throws(() => createInstalledAppEnvironment(parentEnvironment, "  "), /isolated WebView user-data folder/);
});

test("installed diagnostics build exact Windows sidecar and local log paths", () => {
  const paths = createInstalledDiagnosticPaths("D:\\temp\\forge\\install-1", "C:\\Users\\runner\\AppData\\Local\\Forge");

  assert.deepEqual(paths, {
    sidecar: path.win32.join("D:\\temp\\forge\\install-1", "resources", "forge-sidecar", "forge-sidecar.exe"),
    log: path.win32.join("C:\\Users\\runner\\AppData\\Local", "Forge", "logs", "forge-desktop.log"),
  });
});

test("installed smoke observes the system and isolated WebView download directories", () => {
  assert.deepEqual(
    downloadDirectories("C:\\Users\\runner", "D:\\temp\\forge-profile"),
    [
      path.win32.join("C:\\Users\\runner\\Downloads"),
      path.win32.join("D:\\temp\\forge-profile", "Default", "Downloads"),
    ],
  );
});

test("cleanup failures preserve the primary installed-app error and process diagnostics", () => {
  assert.equal(
    describeInstalledSmokeFailure(
      new Error("Timed out waiting for WebView2 remote debugging endpoint"),
      new Error("owned app-process cleanup failed"),
      { pid: 2718, sidecar: "not started" },
    ),
    "Timed out waiting for WebView2 remote debugging endpoint; cleanup failure: owned app-process cleanup failed; installed process diagnostics={\"pid\":2718,\"sidecar\":\"not started\"}",
  );
});
