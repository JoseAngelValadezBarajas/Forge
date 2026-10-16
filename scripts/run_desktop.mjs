import { spawnSync } from "node:child_process";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertBuildPrerequisites, assertNoSourcePathLeak, assertTreeNoSourcePathLeak, findNsiInstaller, resolveGeneratedPath, sha256File } from "./desktop-build-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredCommands = ["npm", "cargo", "rustc", "cl.exe", "makensis.exe"];
const availableCommands = requiredCommands.filter((command) => {
  const search = spawnSync("where.exe", [command], { stdio: "ignore", shell: true });
  return search.status === 0;
});
assertBuildPrerequisites({ platform: process.platform, architecture: process.arch, requiredCommands, availableCommands });

const frontend = path.join(root, "frontend");
const tauriProject = path.join(root, "desktop");
const environment = {
  ...process.env,
  TAURI_APP_PATH: tauriProject,
  TAURI_FRONTEND_PATH: frontend,
};
const result = spawnSync(
  "npm",
  ["exec", "tauri", "--", "build", "--ci", "--no-sign", "--target", "x86_64-pc-windows-msvc", "--bundles", "nsis"],
  { cwd: frontend, env: environment, stdio: "inherit", shell: true },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Tauri packaging exited with status ${result.status ?? "unknown"}.`);

const bundleDirectory = path.join(root, "desktop", "src-tauri", "target", "x86_64-pc-windows-msvc", "release", "bundle", "nsis");
const installer = await findNsiInstaller(bundleDirectory);
await assertNoSourcePathLeak(await readFile(installer), root);
const releaseDirectory = resolveGeneratedPath(root, "desktop/bundle");
await mkdir(releaseDirectory, { recursive: true });
const releaseInstaller = path.join(releaseDirectory, path.basename(installer));
await copyFile(installer, releaseInstaller);
const digest = await sha256File(releaseInstaller);
await writeFile(`${releaseInstaller}.sha256`, `${digest}  ${path.basename(releaseInstaller)}\n`, "utf8");

const configText = await readFile(path.join(root, "desktop", "src-tauri", "tauri.conf.json"), "utf8");
assertNoSourcePathLeak(configText, root);
console.log(`Unsigned NSIS installer: ${releaseInstaller}`);
console.log(`SHA-256: ${digest}`);
