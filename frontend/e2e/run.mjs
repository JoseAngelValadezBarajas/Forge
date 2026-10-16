import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  cleanupRunResourceDirectory,
  createRunResourceDirectory,
} from "./run-resources.mjs";

const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const playwrightCli = join(frontendRoot, "node_modules", "@playwright", "test", "cli.js");
const runResourceDirectory = createRunResourceDirectory();
const runPlaywright = (args) =>
  spawnSync(process.execPath, [playwrightCli, "test", ...args], {
    cwd: frontendRoot,
    env: { ...process.env, FORGE_E2E_RESOURCE_DIR: runResourceDirectory },
    stdio: "inherit",
  });

const requestedArgs = process.argv.slice(2);
let status;
let cleanupFailed = false;
try {
  if (requestedArgs.length === 0) {
    // Visual references require a pristine fixture database; run them in their own
    // server lifecycle so earlier E2E journeys cannot change workspace-wide counts.
    const visualResult = runPlaywright(["e2e/visual-baseline.spec.ts"]);
    status = visualResult.status ?? 1;
    if (status === 0) {
      const behaviorResult = runPlaywright([
        "--grep-invert",
        "captures deterministic visual baselines for shell and representative product surfaces",
      ]);
      status = behaviorResult.status ?? 1;
    }
  } else {
    status = runPlaywright(requestedArgs).status ?? 1;
  }
} finally {
  try {
    cleanupRunResourceDirectory(runResourceDirectory);
  } catch (error) {
    cleanupFailed = true;
    globalThis.console.error("Could not remove this E2E invocation's temporary resources:", error);
  }
}
process.exit(status === 0 && !cleanupFailed ? 0 : status || 1);
