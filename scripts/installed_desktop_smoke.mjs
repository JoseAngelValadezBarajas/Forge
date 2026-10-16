import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, readdir } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "../frontend/node_modules/playwright/index.mjs";
import { sha256File } from "./desktop-build-utils.mjs";

const installer = process.env.FORGE_DESKTOP_INSTALLER;
if (!installer) throw new Error("FORGE_DESKTOP_INSTALLER must point to the built NSIS installer.");
if (process.platform !== "win32") throw new Error("Installed Forge smoke requires Windows.");

const runRoot = process.env.RUNNER_TEMP ?? process.env.TEMP;
if (!runRoot) throw new Error("A disposable Windows runner temp directory is required.");
const smokeRoot = path.join(runRoot, `forge-desk01-${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}`);
const installDirectory = path.join(smokeRoot, "install-1");
const reinstallDirectory = path.join(smokeRoot, "install-2");
const webviewProfile = path.join(smokeRoot, "webview-profile");
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
    { FORGE_INSTALLED_EXE: path.join(targetDirectory, "Forge.exe") },
  );
}

function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not reserve a WebView2 debug port."));
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
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

async function startInstalledApp(targetDirectory, debugPort) {
  const executable = path.join(targetDirectory, "Forge.exe");
  await access(executable);
  const process = spawn(executable, [], {
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: webviewProfile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort} --remote-debugging-address=127.0.0.1`,
    },
  });
  process.once("error", (error) => { throw error; });
  try {
    await waitFor(async () => {
      if (process.exitCode !== null) throw new Error(`Forge exited early with ${process.exitCode}.`);
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`).catch(() => null);
      return response?.ok;
    }, "WebView2 remote debugging endpoint", 120_000);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.newPage();
    const consoleErrors = [];
    const loopbackRequests = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("request", (request) => {
      if (/^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\//.test(request.url())) loopbackRequests.push(request.url());
    });
    await page.waitForURL(/^http:\/\/tauri\.localhost(?:\/|$)/, { timeout: 60_000 });
    await page.getByRole("heading", { name: "Workspace", exact: true }).waitFor({ timeout: 60_000 });
    return { process, browser, page, consoleErrors, loopbackRequests };
  } catch (error) {
    if (process.exitCode === null) process.kill();
    await once(process, "exit").catch(() => undefined);
    throw error;
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
  await app.browser.close().catch(() => undefined);
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
  const app = await startInstalledApp(targetDirectory, await freeLoopbackPort());
  let sidecarProcessId;
  try {
    const details = await sidecarDetails(app.process.pid, targetDirectory);
    sidecarProcessId = details.processId;
    powershell(
      "Stop-Process -Id ([int]$env:FORGE_APP_PID) -Force -ErrorAction Stop",
      { FORGE_APP_PID: String(app.process.pid) },
    );
    const exited = app.process.exitCode !== null || app.process.signalCode !== null || await Promise.race([
      once(app.process, "exit").then(() => true),
      delay(15_000).then(() => false),
    ]);
    assert(exited, "the test-owned Forge process must terminate after forced stop");
    await app.browser.close().catch(() => undefined);
    await assertProcessExited(details.processId);
  } finally {
    if (app.process.exitCode === null && app.process.signalCode === null) {
      app.process.kill();
      await once(app.process, "exit").catch(() => undefined);
    }
    await app.browser.close().catch(() => undefined);
  }
}

async function assertSecondLaunchDoesNotSpawnSidecar(targetDirectory, originalSidecarPid) {
  const executable = path.join(targetDirectory, "Forge.exe");
  const duplicate = spawn(executable, [], { stdio: "ignore", env: process.env });
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

async function createWorkspaceAndProject(page, nameSuffix) {
  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  const workspaceName = `Desktop Smoke ${nameSuffix}`;
  await page.getByLabel("Name").fill(workspaceName);
  await page.getByLabel("Description").fill("Created by the installed Windows desktop smoke.");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.locator("button.workspace-switcher").getByText(workspaceName).waitFor();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: /New project/ }).click();
  const projectName = `Persisted Project ${nameSuffix}`;
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("Project description").fill("Local SQLite persistence check.");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.getByRole("heading", { name: projectName, exact: true, level: 1 }).waitFor();
  await page.getByRole("link", { name: "Features and Epics", exact: true }).click();
  await page.getByRole("button", { name: "+ Feature", exact: true }).click();
  const featureName = `Desktop Feature ${nameSuffix}`;
  await page.getByLabel("Title").fill(featureName);
  await page.getByLabel("Goal").fill("Persist a real planning record through a desktop restart.");
  await page.getByLabel("Description").fill("Installed-product planning persistence check.");
  await page.getByRole("button", { name: "Create feature", exact: true }).click();
  await page.getByRole("heading", { name: new RegExp(featureName) }).waitFor();
  return { workspaceName, projectName, featureName };
}

async function assertExternalNavigationBlocked(page) {
  const appUrl = page.url();
  await page.evaluate(() => { window.location.href = "https://attacker.invalid/"; }).catch(() => undefined);
  await page.waitForTimeout(500);
  assert.equal(page.url(), appUrl, "external top-level navigation must remain blocked");
  await page.evaluate(() => { window.open("https://attacker.invalid/", "_blank"); });
  await page.waitForTimeout(300);
  assert.equal(page.context().pages().length, 1, "external popups must remain blocked");
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
  const port = await freeLoopbackPort();
  app = await startInstalledApp(targetDirectory, port);
  await app.page.screenshot({ path: path.join(screenshotDirectory, `${suffix}-first-run.png`), fullPage: true });
  const records = expectedProject ?? await createWorkspaceAndProject(app.page, suffix);
  if (expectedProject) {
    await app.page.getByRole("heading", { name: "Workspace", exact: true, level: 1 }).waitFor();
    const projectCard = app.page.getByRole("heading", { name: expectedProject.projectName, exact: true, level: 3 });
    await projectCard.waitFor();
    await projectCard.click();
    await app.page.getByRole("heading", { name: expectedProject.projectName, exact: true, level: 1 }).waitFor();
    await app.page.getByRole("link", { name: "Features and Epics", exact: true }).click();
    await app.page.getByRole("heading", { name: expectedProject.featureName, exact: true, level: 3 }).waitFor();
  }
  await app.page.screenshot({ path: path.join(screenshotDirectory, `${suffix}-project.png`), fullPage: true });
  if (!expectedProject) {
    const details = await sidecarDetails(app.process.pid, targetDirectory);
    assert.notEqual(details.port, sentinel.port, "the sidecar must use its own ephemeral port, not the sentinel listener");
    assert.equal(sentinel.server.received, 0, "the unrelated loopback listener must receive no request");
    await assertIndependentProcessCannotAccessApi(details.port, records.workspaceName);
    await assertSecondLaunchDoesNotSpawnSidecar(targetDirectory, details.processId);
    await assertExternalNavigationBlocked(app.page);
    await app.page.locator("button.workspace-switcher").click();
    await app.page.getByRole("menuitem", { name: records.workspaceName }).waitFor();
    await app.page.getByRole("menuitem", { name: "Create workspace", exact: true }).waitFor();
    assert.equal(await app.page.getByRole("menuitem", { name: "Unauthorized Desktop Workspace" }).count(), 0);
    await app.page.keyboard.press("Escape");
    assert.deepEqual(app.consoleErrors, [], `unexpected WebView console errors: ${app.consoleErrors.join(" | ")}`);
    assert.deepEqual(app.loopbackRequests, [], `WebView made direct loopback API requests: ${app.loopbackRequests.join(" | ")}`);
    assert.equal(sentinel.server.received, 0, "the unrelated loopback listener must remain untouched");
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
console.log(`Installed NSIS smoke passed on ${osVersion}; workspace/project/feature survived restart, uninstall and reinstall.`);
