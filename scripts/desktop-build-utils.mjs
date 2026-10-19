import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export function resolveGeneratedPath(repositoryRoot, relativePath) {
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Desktop build output must be a child of the repository.");
  }
  return resolved;
}

export function assertBuildPrerequisites({ platform, architecture, requiredCommands, availableCommands }) {
  if (platform !== "win32" || architecture !== "x64") {
    throw new Error("Forge Desktop Alpha packaging requires Windows x64.");
  }
  const available = new Set(availableCommands);
  const missing = requiredCommands.filter((command) => !available.has(command));
  if (missing.length) throw new Error(`Missing desktop build prerequisites: ${missing.join(", ")}.`);
}

export function createInstalledAppEnvironment(parentEnvironment, userDataFolder) {
  if (typeof userDataFolder !== "string" || !userDataFolder.trim()) {
    throw new Error("Installed app smoke requires an isolated WebView user-data folder.");
  }
  const childEnvironment = {
    ...parentEnvironment,
    WEBVIEW2_USER_DATA_FOLDER: userDataFolder,
  };
  delete childEnvironment.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
  delete childEnvironment.WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER;
  return childEnvironment;
}

export function downloadDirectories(userProfile, webviewProfile) {
  const directories = [
    path.join(userProfile, "Downloads"),
    path.join(webviewProfile, "Default", "Downloads"),
  ];
  return [...new Set(directories)];
}

export function createInstalledDiagnosticPaths(installDirectory, localDataRoot) {
  return {
    sidecar: path.win32.join(installDirectory, "resources", "forge-sidecar", "forge-sidecar.exe"),
    log: path.win32.join(localDataRoot, "logs", "forge-desktop.log"),
  };
}

export function describeInstalledSmokeFailure(primaryError, cleanupError, diagnostics) {
  const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
  const cleanupMessage = cleanupError
    ? `; cleanup failure: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
    : "";
  return `${primaryMessage}${cleanupMessage}; installed process diagnostics=${JSON.stringify(diagnostics)}`;
}

export async function findNsiInstaller(bundleDirectory) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && /-setup\.exe$/i.test(entry.name)) files.push(fullPath);
    }
  }
  await stat(bundleDirectory);
  await visit(bundleDirectory);
  if (files.length !== 1) throw new Error(`Expected one NSIS setup executable, found ${files.length}.`);
  return files[0];
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export function assertNoSourcePathLeak(text, repositoryRoot) {
  const normalizedRoot = path.resolve(repositoryRoot).replaceAll("\\", "/").toLowerCase();
  const variants = [normalizedRoot, normalizedRoot.replaceAll("/", "\\")];
  const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8");
  const raw = bytes.toString("latin1").toLowerCase();
  const utf16 = bytes.toString("utf16le").toLowerCase();
  const leaks = variants.some((variant) =>
    raw.includes(variant) || utf16.includes(variant),
  );
  if (leaks) {
    throw new Error("Desktop bundle metadata contains the source checkout path.");
  }
}

export async function assertTreeNoSourcePathLeak(directory, repositoryRoot) {
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) assertNoSourcePathLeak(await readFile(target), repositoryRoot);
    }
  }
  await visit(directory);
}
