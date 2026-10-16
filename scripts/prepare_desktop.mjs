import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertBuildPrerequisites, assertTreeNoSourcePathLeak, resolveGeneratedPath } from "./desktop-build-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontend = path.join(root, "frontend");
const sidecarBuild = path.join(root, "backend", "dist", "forge-sidecar");
const sidecarExe = path.join(sidecarBuild, "forge-sidecar.exe");
const tauriIcons = path.join(root, "desktop", "src-tauri", "icons");
const resourceTarget = resolveGeneratedPath(root, "desktop/src-tauri/resources/forge-sidecar");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? "unknown"}.`);
}

const requiredCommands = ["uv", "npm"];
const availableCommands = requiredCommands.filter((command) => {
  const search = spawnSync("where.exe", [command], { stdio: "ignore", shell: true });
  return search.status === 0;
});
assertBuildPrerequisites({ platform: process.platform, architecture: process.arch, requiredCommands, availableCommands });

run("uv", ["run", "--locked", "--dev", "--group", "desktop-build", "python", "scripts/export_desktop_api_routes.py", "--check"], root);
run("npm", ["run", "build"], frontend);
run("uv", ["run", "--locked", "--group", "desktop-build", "pyinstaller", "--clean", "--noconfirm", "backend/desktop_sidecar.spec", "--distpath", "backend/dist", "--workpath", "backend/build/desktop-pyinstaller"], root);

if (!(await stat(sidecarExe).catch(() => null))?.isFile()) {
  throw new Error("PyInstaller did not produce backend/dist/forge-sidecar/forge-sidecar.exe.");
}
if (!(await stat(path.join(sidecarBuild, "_internal", "migrations", "env.py")).catch(() => null))?.isFile()) {
  throw new Error("The onedir sidecar is missing its bundled Alembic migrations.");
}

await rm(resourceTarget, { recursive: true, force: true });
await mkdir(path.dirname(resourceTarget), { recursive: true });
await cp(sidecarBuild, resourceTarget, { recursive: true, force: true });
await assertTreeNoSourcePathLeak(resourceTarget, root);
run("npm", ["exec", "tauri", "--", "icon", "../desktop/src-tauri/icons/forge.svg", "--output", "../desktop/src-tauri/icons"], frontend);
if (!(await stat(path.join(tauriIcons, "icon.ico")).catch(() => null))?.isFile()) {
  throw new Error("Tauri did not generate the Windows icon.");
}

console.log("Desktop inputs prepared: frontend, OpenAPI route manifest, PyInstaller onedir sidecar and Windows icons.");
