import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const playwrightCli = join(frontendRoot, "node_modules", "@playwright", "test", "cli.js");
const runPlaywright = (args) =>
  spawnSync(process.execPath, [playwrightCli, "test", ...args], {
    cwd: frontendRoot,
    env: process.env,
    stdio: "inherit",
  });

const requestedArgs = process.argv.slice(2);
let status;
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

const temporaryDatabasePaths = () =>
  readdirSync(tmpdir())
    .filter(
      (name) =>
        name.startsWith("forge-fnd03-e2e-") &&
        [".db", ".db-wal", ".db-shm", ".db.shutdown"].some((suffix) => name.endsWith(suffix)),
    )
    .map((name) => join(tmpdir(), name));

let remaining = temporaryDatabasePaths();
for (let attempt = 0; attempt < 20 && remaining.length > 0; attempt += 1) {
  for (const path of remaining) {
    try {
      rmSync(path, { force: true });
    } catch {
      // A short retry window covers Windows file-handle release after webServer shutdown.
    }
  }
  remaining = temporaryDatabasePaths();
  if (remaining.length > 0) await delay(100);
}

if (remaining.length > 0) {
  globalThis.console.error(`Could not remove temporary E2E resources: ${remaining.join(", ")}`);
}

process.exit(status === 0 && remaining.length === 0 ? 0 : status || 1);
