import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { copyGuideAssets, shouldPromoteGuideAssets } from "./user-guide-assets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "frontend");
const outputDirectory = resolve(root, "docs", "user-guide", "assets");
const stagingDirectory = `${outputDirectory}.staging`;
const backupDirectory = `${outputDirectory}.previous`;
const candidateDirectory = resolve(frontend, "artifacts", "rfx-org-03b", "candidate");
const workspaceCreatePath = resolve(stagingDirectory, "workspace-create.png");
const run = (args, env = {}) => {
  const result = spawnSync(process.execPath, args, { cwd: frontend, env: { ...process.env, ...env }, stdio: "inherit" });
  return result.status ?? 1;
};

rmSync(candidateDirectory, { recursive: true, force: true });
rmSync(stagingDirectory, { recursive: true, force: true });
rmSync(backupDirectory, { recursive: true, force: true });
mkdirSync(stagingDirectory, { recursive: true });
const visualStatus = run(["e2e/run.mjs", "e2e/visual-baseline.spec.ts"]);
const workspaceStatus = run(["e2e/run.mjs", "e2e/user-guide-assets.spec.ts"], {
  FORGE_USER_GUIDE_CAPTURE: "1",
  FORGE_USER_GUIDE_WORKSPACE_CREATE: workspaceCreatePath,
});
if (!shouldPromoteGuideAssets(visualStatus, workspaceStatus)) {
  rmSync(stagingDirectory, { recursive: true, force: true });
  console.error("Guide assets were not promoted because a source visual fixture did not pass its normal checks.");
  process.exitCode = visualStatus || workspaceStatus;
} else {
  copyGuideAssets({ candidateDirectory, workspaceCreatePath, outputDirectory: stagingDirectory });
  renameSync(outputDirectory, backupDirectory);
  try {
    renameSync(stagingDirectory, outputDirectory);
  } catch (error) {
    renameSync(backupDirectory, outputDirectory);
    throw error;
  }
  rmSync(backupDirectory, { recursive: true, force: true });
}
