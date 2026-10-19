import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createInstalledAppEnvironment,
  createInstalledDiagnosticPaths,
  describeInstalledSmokeFailure,
  sha256File,
} from "./desktop-build-utils.mjs";

const installer = process.env.FORGE_DESKTOP_INSTALLER;
if (!installer) throw new Error("FORGE_DESKTOP_INSTALLER must point to the built NSIS installer.");
if (process.platform !== "win32") throw new Error("Installed Forge smoke requires Windows.");

// Tauri keeps the Cargo binary target name for the installed executable; the
// user-facing product and installer are named Forge.
const installedExecutableName = "forge-desktop.exe";
const runRoot = process.env.RUNNER_TEMP ?? process.env.TEMP;
if (!runRoot) throw new Error("A disposable Windows runner temp directory is required.");
const smokeRoot = path.join(runRoot, `forge-desk01-${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}`);
const installDirectory = path.join(smokeRoot, "install-1");
const reinstallDirectory = path.join(smokeRoot, "install-2");
const webviewProfile = path.join(smokeRoot, "webview-profile");
const uiAutomationScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "desktop-ui-automation.ps1");
const screenshotDirectory = path.join(process.env.FORGE_DESKTOP_EVIDENCE ?? path.join(smokeRoot, "evidence"));
const localDataRoot = path.join(process.env.LOCALAPPDATA ?? "", "Forge");
const databasePath = path.join(localDataRoot, "data", "forge.db");
const logPath = path.join(localDataRoot, "logs", "forge-desktop.log");

await mkdir(smokeRoot, { recursive: false });
await mkdir(screenshotDirectory, { recursive: true });
if (await access(databasePath).then(() => true).catch(() => false)) {
  throw new Error("The disposable runner already contains Forge user data; refusing to overwrite it.");
}

function powershell(script, extraEnvironment = {}) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ...extraEnvironment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`PowerShell smoke helper failed (${result.status}): ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function install(targetDirectory) {
  const result = spawnSync(installer, ["/S", `/D=${targetDirectory}`], { stdio: "inherit", timeout: 180_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`NSIS installation failed with ${result.status}.`);
}

function assertStartMenuShortcut(targetDirectory) {
  powershell(
    "$start = [Environment]::GetFolderPath('Programs'); $shell = New-Object -ComObject WScript.Shell; $target = $env:FORGE_INSTALLED_EXE; " +
    "$found = Get-ChildItem -LiteralPath $start -Filter '*.lnk' -File -Recurse | Where-Object { $shell.CreateShortcut($_.FullName).TargetPath -ieq $target } | Select-Object -First 1; " +
    "if (-not $found) { throw 'Installed Forge Start-menu shortcut was not found.' }",
    { FORGE_INSTALLED_EXE: path.join(targetDirectory, installedExecutableName) },
  );
}

function runUiAutomation(action, processId, options = {}) {
  const environment = {
    ...process.env,
    FORGE_UIA_ACTION: action,
    FORGE_UIA_PROCESS_ID: String(processId),
    FORGE_UIA_CONTROL_TYPE: options.controlType ?? "*",
    FORGE_UIA_NAME: options.name ?? "",
    FORGE_UIA_VALUE: options.value ?? "",
    FORGE_UIA_MATCH: options.match ?? "exact",
    FORGE_UIA_TIMEOUT_SECONDS: String(options.timeoutSeconds ?? 30),
    FORGE_UIA_SCREENSHOT_PATH: options.screenshotPath ?? "",
    FORGE_UIA_FILE_PATH: options.filePath ?? "",
  };
  const timeoutSeconds = options.timeoutSeconds ?? 30;
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", uiAutomationScript,
  ], { encoding: "utf8", timeout: (timeoutSeconds + 15) * 1_000, env: environment });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Windows UI Automation ${action} failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function createUiAutomation(processId) {
  return {
    wait: (controlType, name, timeoutSeconds = 60, match = "exact") => runUiAutomation("wait", processId, { controlType, name, timeoutSeconds, match }),
    click: (controlType, name, match = "exact") => runUiAutomation("click", processId, { controlType, name, match }),
    setValue: (name, value) => runUiAutomation("set-value", processId, { controlType: "Edit", name, value }),
    chooseFile: (name, filePath, match = "contains") => runUiAutomation("choose-file", processId, { controlType: "Button", name, filePath, match }),
    screenshot: (screenshotPath) => runUiAutomation("screenshot", processId, { screenshotPath }),
    inspect: () => runUiAutomation("inspect", processId),
  };
}

function diagnoseInstalledApp(appPid, targetDirectory) {
  const diagnosticPaths = createInstalledDiagnosticPaths(targetDirectory, localDataRoot);
  const output = powershell(
    "$parent = [int]$env:FORGE_APP_PID; $install = $env:FORGE_INSTALL_DIR; " +
    "$all = @(Get-CimInstance Win32_Process); $queue = [System.Collections.Generic.Queue[int]]::new(); $queue.Enqueue($parent); " +
    "$seen = [System.Collections.Generic.HashSet[int]]::new(); [void]$seen.Add($parent); $children = [System.Collections.Generic.List[object]]::new(); " +
    "while ($queue.Count -gt 0) { $current = $queue.Dequeue(); foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $current }) { " +
    "if ($seen.Add([int]$child.ProcessId)) { $children.Add($child); $queue.Enqueue([int]$child.ProcessId) } } }; " +
    "$main = Get-Process -Id $parent -ErrorAction SilentlyContinue | Select-Object Id,MainWindowHandle,MainWindowTitle; " +
    "$owned = @($all | Where-Object { $seen.Contains([int]$_.ProcessId) }); $ownedIds = @($owned | ForEach-Object { [int]$_.ProcessId }); " +
    "$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ownedIds -contains [int]$_.OwningProcess } | Select-Object LocalAddress,LocalPort,OwningProcess); " +
    "$sidecarPath = $env:FORGE_EXPECTED_SIDECAR; " +
    "$sidecarMatches = @(Get-ChildItem -LiteralPath $install -Filter 'forge-sidecar.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName); " +
    "$logPath = $env:FORGE_EXPECTED_LOG; " +
    "$knownFailures = @('Forge''s bundled local service is missing.', 'Forge could not launch its bundled local service.', 'Forge could not establish local service process ownership.', 'Forge local service exited before readiness.', 'Forge local service startup timed out.', 'Forge local service readiness was invalid.', 'Forge local service readiness verification failed.', 'Forge sidecar startup failed; see the local Forge log for details.'); " +
    "$startupFailure = $null; foreach ($line in @(Get-Content -LiteralPath $logPath -Tail 50 -ErrorAction SilentlyContinue)) { foreach ($known in $knownFailures) { if ($line.Contains($known)) { $startupFailure = $known; break } }; if ($startupFailure) { break } }; " +
    "$appExecutable = ($all | Where-Object { $_.ProcessId -eq $parent } | Select-Object -First 1 -ExpandProperty ExecutablePath); " +
    "$result = [pscustomobject]@{ MainWindow=$main; AppExecutablePath=$appExecutable; ExecutableDirectory=(Split-Path -Parent $appExecutable); InstallRoot=$install; ChildProcesses=@($children | Select-Object Name,ProcessId,ParentProcessId); OwnedListeners=$listeners; ExpectedSidecarPath=$sidecarPath; BundledSidecarExists=(Test-Path -LiteralPath $sidecarPath -PathType Leaf); BundledSidecarMatches=$sidecarMatches; ExpectedLogPath=$logPath; StartupLogExists=(Test-Path -LiteralPath $logPath -PathType Leaf); StartupFailure=$startupFailure }; " +
    "$result | ConvertTo-Json -Compress -Depth 4",
    {
      FORGE_APP_PID: String(appPid),
      FORGE_INSTALL_DIR: targetDirectory,
      FORGE_EXPECTED_SIDECAR: diagnosticPaths.sidecar,
      FORGE_EXPECTED_LOG: diagnosticPaths.log,
    },
  );
  return JSON.parse(output);
}

async function startSentinelListener() {
  const server = net.createServer((socket) => {
    server.received += 1;
    socket.destroy();
  });
  server.received = 0;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string", "sentinel must bind loopback");
  return { server, port: address.port };
}

function rawApiRequest(port, method, requestPath, host, extraHeaders = {}, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: requestPath,
      headers: { Host: host, ...extraHeaders },
      agent: false,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitFor(predicate, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ""}`);
}

async function startInstalledApp(targetDirectory) {
  const executable = path.join(targetDirectory, installedExecutableName);
  await access(executable);
  let appProcess;
  try {
    const launchEnvironment = createInstalledAppEnvironment(process.env, webviewProfile);
    appProcess = spawn(executable, [], { stdio: "ignore", env: launchEnvironment });
    appProcess.once("error", (error) => { throw error; });
    const ui = createUiAutomation(appProcess.pid);
    ui.wait("Text", "Workspace", 120);
    return { process: appProcess, ui };
  } catch (error) {
    let diagnostics;
    if (appProcess?.pid) {
      try {
        diagnostics = diagnoseInstalledApp(appProcess.pid, targetDirectory);
        try {
          diagnostics.accessibility = runUiAutomation("inspect", appProcess.pid);
        } catch (diagnosticError) {
          diagnostics.accessibilityError = String(diagnosticError);
        }
      } catch (diagnosticError) {
        diagnostics = { diagnosticError: String(diagnosticError) };
      }
    }
    let cleanupError;
    try {
      if (appProcess && appProcess.exitCode === null && appProcess.signalCode === null) {
        appProcess.kill();
        await Promise.race([once(appProcess, "exit"), delay(5_000)]);
      }
    } catch (caughtCleanupError) {
      cleanupError = caughtCleanupError;
    }
    throw new Error(describeInstalledSmokeFailure(error, cleanupError, diagnostics), { cause: error });
  }
}

async function closeInstalledApp(app) {
  const pid = String(app.process.pid);
  powershell(
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ForgeWindow { [DllImport(\"user32.dll\")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam); }'; " +
    "$p = Get-Process -Id $env:FORGE_APP_PID -ErrorAction Stop; if ($p.MainWindowHandle -eq [IntPtr]::Zero) { throw 'Main window was not found.' }; " +
    "[ForgeWindow]::PostMessage($p.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null",
    { FORGE_APP_PID: pid },
  );
  const exited = Promise.race([
    once(app.process, "exit").then(() => true),
    delay(15_000).then(() => false),
  ]);
  if (!(await exited)) {
    app.process.kill();
    await once(app.process, "exit").catch(() => undefined);
    throw new Error("Forge did not close after WM_CLOSE; the test-owned app process was stopped.");
  }
}

async function sidecarDetails(appPid, targetDirectory) {
  const output = powershell(
    "$appPid = [int]$env:FORGE_PARENT_PID; $install = $env:FORGE_INSTALL_DIR; " +
    "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'forge-sidecar.exe' -and $_.ParentProcessId -eq $appPid -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($install, [StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1; " +
    "if (-not $p) { exit 10 }; $port = Get-NetTCPConnection -State Listen -OwningProcess $p.ProcessId -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -First 1 -ExpandProperty LocalPort; " +
    "if (-not $port) { exit 11 }; \"$($p.ProcessId):$port\"",
    { FORGE_PARENT_PID: String(appPid), FORGE_INSTALL_DIR: targetDirectory },
  );
  const [processId, port] = output.split(":").map(Number);
  assert(Number.isInteger(processId) && processId > 0, "owned sidecar PID must be available");
  assert(Number.isInteger(port) && port > 0 && port <= 65535, "sidecar must bind an ephemeral loopback port");
  return { processId, port };
}

async function assertProcessExited(processId) {
  await waitFor(() => {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "if (Get-Process -Id $env:FORGE_PROCESS_ID -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"], {
      env: { ...process.env, FORGE_PROCESS_ID: String(processId) },
    });
    return result.status === 0;
  }, `owned sidecar process ${processId} to exit`, 15_000);
}

async function assertForcedTerminationCleansSidecar(targetDirectory) {
  const app = await startInstalledApp(targetDirectory);
  try {
    const details = await sidecarDetails(app.process.pid, targetDirectory);
    powershell(
      "Stop-Process -Id ([int]$env:FORGE_APP_PID) -Force -ErrorAction Stop",
      { FORGE_APP_PID: String(app.process.pid) },
    );
    const exited = app.process.exitCode !== null || app.process.signalCode !== null || await Promise.race([
      once(app.process, "exit").then(() => true),
      delay(15_000).then(() => false),
    ]);
    assert(exited, "the test-owned Forge process must terminate after forced stop");
    await assertProcessExited(details.processId);
  } finally {
    if (app.process.exitCode === null && app.process.signalCode === null) {
      app.process.kill();
      await once(app.process, "exit").catch(() => undefined);
    }
  }
}

async function assertSecondLaunchDoesNotSpawnSidecar(targetDirectory, originalSidecarPid) {
  const executable = path.join(targetDirectory, installedExecutableName);
  const duplicate = spawn(executable, [], { stdio: "ignore", env: createInstalledAppEnvironment(process.env, webviewProfile) });
  try {
    await delay(1_500);
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command",
        "$duplicate = [int]$env:FORGE_DUPLICATE_PID; $original = [int]$env:FORGE_ORIGINAL_SIDECAR_PID; $install = $env:FORGE_INSTALL_DIR; " +
        "if (-not (Get-Process -Id $original -ErrorAction SilentlyContinue)) { exit 2 }; " +
        "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'forge-sidecar.exe' -and $_.ParentProcessId -eq $duplicate -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($install, [StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1; " +
        "if ($p) { exit 1 } else { exit 0 }"],
      { env: { ...process.env, FORGE_DUPLICATE_PID: String(duplicate.pid), FORGE_ORIGINAL_SIDECAR_PID: String(originalSidecarPid), FORGE_INSTALL_DIR: targetDirectory } },
    );
    assert.equal(result.status, 0, "a second Forge launch must not start another sidecar");
    assert(originalSidecarPid > 0, "the first launch owns a sidecar");
  } finally {
    if (duplicate.exitCode === null) {
      duplicate.kill();
      await once(duplicate, "exit").catch(() => undefined);
    }
  }
}

async function createWorkspaceAndProject(ui, nameSuffix) {
  ui.click("Button", "No workspace selected");
  ui.click("MenuItem", "Create workspace");
  const workspaceName = `Desktop Smoke ${nameSuffix}`;
  ui.setValue("Name", workspaceName);
  ui.setValue("Description", "Created by the installed Windows desktop smoke.");
  ui.click("Button", "Create");
  ui.wait("Button", workspaceName);
  ui.click("Hyperlink", "Projects");
  ui.wait("Text", "Projects");
  ui.click("Button", "+ New project");
  const projectName = `Persisted Project ${nameSuffix}`;
  ui.setValue("Project name", projectName);
  ui.setValue("Project description", "Local SQLite persistence check.");
  ui.click("Button", "Create project");
  ui.wait("Text", projectName);
  ui.click("Hyperlink", "Features and Epics");
  ui.click("Button", "+ Feature");
  const featureName = `Desktop Feature ${nameSuffix}`;
  ui.setValue("Title", featureName);
  ui.setValue("Goal", "Persist a real planning record through a desktop restart.");
  ui.setValue("Description", "Installed-product planning persistence check.");
  ui.click("Button", "Create feature");
  ui.wait("Text", featureName, 60, "contains");
  return { workspaceName, projectName, featureName };
}

const downloadDirectory = path.join(process.env.USERPROFILE ?? "", "Downloads");

async function downloadedFiles() {
  return new Set(
    (await readdir(downloadDirectory, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name),
  );
}

async function exportAndVerify(ui, expectedProjectName, expectedFeatureName) {
  const before = await downloadedFiles();
  ui.click("Button", "Export project");
  ui.wait("Text", "Export project", 30, "exact");
  ui.click("Button", "Download JSON");
  const fileName = await waitFor(async () => {
    const current = await downloadedFiles();
    return [...current].find((name) => !before.has(name) && name.startsWith("forge-project-"));
  }, "the exported Project JSON in Downloads");
  const downloadedPath = path.join(downloadDirectory, fileName);
  try {
    const document = JSON.parse(await readFile(downloadedPath, "utf8"));
    assert.equal(document.schema_version, "forge-project-import-v1");
    assert.equal(document.project?.name, expectedProjectName);
    assert(Array.isArray(document.features), "the export must contain the planning Features array");
    if (expectedFeatureName) {
      assert(document.features.some((feature) => feature.title === expectedFeatureName), "the export must contain the real Feature hierarchy");
    }
    return document;
  } finally {
    await unlink(downloadedPath);
  }
}

async function runProjectTransferJourney(ui, records, nameSuffix) {
  ui.click("Hyperlink", "Projects");
  ui.wait("Text", "Projects");
  ui.click("Button", records.projectName, "contains");
  ui.wait("Text", records.projectName);
  await exportAndVerify(ui, records.projectName, records.featureName);

  const importedProjectName = `Imported Desktop Planning ${nameSuffix}`;
  const importedFeatureName = `Imported Desktop Feature ${nameSuffix}`;
  const fixturePath = path.join(smokeRoot, `project-transfer-${nameSuffix}.json`);
  const fixture = {
    schema_version: "forge-project-import-v1",
    project: { name: importedProjectName, description: "Installed Project Transfer smoke fixture." },
    epics: [{ ref: "epic:transfer", title: "Transfer Epic" }],
    features: [{
      ref: "feature:transfer",
      title: importedFeatureName,
      epic_ref: "epic:transfer",
      tasks: [{ ref: "task:transfer", title: "Inspect imported hierarchy" }],
      acceptance_criteria: [{ ref: "criterion:transfer", description: "The imported planning snapshot is visible." }],
    }],
    dependencies: [],
  };
  await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  ui.click("Button", "Back to projects");
  ui.wait("Text", "Projects");
  ui.click("Button", "Import project");
  ui.chooseFile("Choose project JSON file", fixturePath);
  ui.wait("Text", path.basename(fixturePath), 30, "contains");
  ui.click("Button", "Preview import");
  ui.wait("Text", importedProjectName, 60, "contains");
  ui.click("Button", "Confirm import");
  ui.wait("Text", importedProjectName, 60, "contains");
  ui.click("Hyperlink", "Features and Epics");
  ui.wait("Text", importedFeatureName, 60, "contains");
  ui.click("Hyperlink", "Projects");
  ui.wait("Text", "Projects");
  ui.click("Button", importedProjectName, "contains");
  ui.wait("Text", importedProjectName);
  await exportAndVerify(ui, importedProjectName, importedFeatureName);
}

async function assertIndependentProcessCannotAccessApi(port, workspaceName) {
  const normalHost = `127.0.0.1:${port}`;
  const health = await rawApiRequest(port, "GET", "/api/health", normalHost);
  assert.equal(health.status, 401, "unauthenticated local reads must require a launch session");
  const workspaceRead = await rawApiRequest(port, "GET", "/api/workspaces", normalHost);
  assert.equal(workspaceRead.status, 401, "workspace data must not be readable by an independent local process");
  assert(!workspaceRead.body.includes(workspaceName), "unauthorized API response must not disclose workspace data");
  const forgedHost = await rawApiRequest(port, "GET", "/api/workspaces", "attacker.invalid");
  assert.equal(forgedHost.status, 400, "unexpected Host must be rejected for GET");
  const forgedMutation = await rawApiRequest(
    port,
    "POST",
    "/api/workspaces",
    "attacker.invalid",
    { "Content-Type": "application/json", Origin: "https://attacker.invalid" },
    JSON.stringify({ name: "Unauthorized Desktop Workspace" }),
  );
  assert.equal(forgedMutation.status, 400, "forged Host and Origin mutation must be rejected");
  const blockedMutation = await rawApiRequest(
    port,
    "POST",
    "/api/workspaces",
    normalHost,
    { "Content-Type": "application/json", Origin: "https://attacker.invalid" },
    JSON.stringify({ name: "Unauthorized Desktop Workspace" }),
  );
  assert.equal(blockedMutation.status, 401, "unauthenticated writes must be rejected before mutation");
}

function launchUninstaller(targetDirectory) {
  return readdir(targetDirectory, { withFileTypes: true }).then(async (entries) => {
    const candidate = entries.find((entry) => entry.isFile() && /^(uninst|uninstall)\.exe$/i.test(entry.name));
    assert(candidate, "installed NSIS uninstaller must exist");
    const result = spawnSync(path.join(targetDirectory, candidate.name), ["/S"], { stdio: "inherit", timeout: 120_000 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, "NSIS uninstall must complete");
  });
}

async function runInstalledJourney(targetDirectory, suffix, expectedProject) {
  const sentinel = expectedProject ? null : await startSentinelListener();
  let app;
  try {
  app = await startInstalledApp(targetDirectory);
  app.ui.screenshot(path.join(screenshotDirectory, `${suffix}-first-run.png`));
  const records = expectedProject ?? await createWorkspaceAndProject(app.ui, suffix);
  if (expectedProject) {
    app.ui.wait("Text", "Workspace");
    app.ui.wait("Button", expectedProject.projectName, 30, "contains");
    app.ui.click("Button", expectedProject.projectName, "contains");
    app.ui.wait("Text", expectedProject.projectName);
    app.ui.click("Hyperlink", "Features and Epics");
    app.ui.wait("Text", expectedProject.featureName, 60, "contains");
  }
  app.ui.screenshot(path.join(screenshotDirectory, `${suffix}-project.png`));
  if (!expectedProject) {
    const details = await sidecarDetails(app.process.pid, targetDirectory);
    assert.notEqual(details.port, sentinel.port, "the sidecar must use its own ephemeral port, not the sentinel listener");
    assert.equal(sentinel.server.received, 0, "the unrelated loopback listener must receive no request");
    await assertIndependentProcessCannotAccessApi(details.port, records.workspaceName);
    await assertSecondLaunchDoesNotSpawnSidecar(targetDirectory, details.processId);
    app.ui.click("Button", records.workspaceName);
    app.ui.wait("MenuItem", records.workspaceName, 60, "contains");
    app.ui.wait("MenuItem", "Create workspace");
    assert(!app.ui.inspect().includes("Unauthorized Desktop Workspace"), "unauthorized workspace creation must not appear in the UI");
    app.ui.click("Button", records.workspaceName);
    assert(!app.ui.inspect().includes("Create workspace"), "workspace menu must close after its switcher is activated again");
    assert.equal(sentinel.server.received, 0, "the unrelated loopback listener must remain untouched");
    await runProjectTransferJourney(app.ui, records, suffix);
    await closeInstalledApp(app);
    app = null;
    await assertProcessExited(details.processId);
    return records;
  }
  const details = await sidecarDetails(app.process.pid, targetDirectory);
  await closeInstalledApp(app);
  app = null;
  await assertProcessExited(details.processId);
  return records;
  } finally {
    if (app && app.process.exitCode === null) {
      await closeInstalledApp(app).catch(() => app.process.kill());
    }
    if (sentinel) await new Promise((resolve) => sentinel.server.close(resolve));
  }
}

const osVersion = powershell("(Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption)");
console.log(`Installed-product runner OS: ${osVersion}`);
install(installDirectory);
assertStartMenuShortcut(installDirectory);
const persistedRecords = await runInstalledJourney(installDirectory, "initial", null);
await assertForcedTerminationCleansSidecar(installDirectory);
assert(await access(databasePath).then(() => true).catch(() => false), "SQLite data must persist after the app exits");
const databaseDigest = await sha256File(databasePath);
await launchUninstaller(installDirectory);
assert(await access(databasePath).then(() => true).catch(() => false), "uninstall must preserve the user's SQLite database");
assert.equal(await sha256File(databasePath), databaseDigest, "uninstall must not alter SQLite user data");
install(reinstallDirectory);
await runInstalledJourney(reinstallDirectory, "reinstall", persistedRecords);
assert(await access(databasePath).then(() => true).catch(() => false), "reinstall must preserve the user's SQLite database");
const log = await import("node:fs/promises").then(({ readFile }) => readFile(logPath, "utf8").catch(() => ""));
assert(!/Bearer\s+[a-f0-9]{64}|session_secret/i.test(log), "runtime log must not contain the session capability");
console.log(`Installed NSIS smoke passed on ${osVersion}; native Windows UI Automation created and reopened workspace/project/feature records, which survived restart, uninstall and reinstall.`);
