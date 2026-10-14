import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const playwrightCli = join(frontendRoot, "node_modules", "@playwright", "test", "cli.js");
const result = spawnSync(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
  cwd: frontendRoot,
  env: process.env,
  stdio: "inherit",
});

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

const status = result.status ?? 1;
process.exit(status === 0 && remaining.length === 0 ? 0 : status || 1);
