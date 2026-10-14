/* global console */

import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

const host = process.argv[2] ?? "127.0.0.1";
const port = process.argv[3] ?? "8000";
const backendDirectory = process.cwd();
const projectRoot = join(backendDirectory, "..");
const uv = process.platform === "win32" ? "uv.exe" : "uv";
const databasePath = join(tmpdir(), `forge-fnd02-e2e-${process.pid}-${Date.now()}.db`);
const env = { ...process.env, FORGE_DATABASE_URL: `sqlite:///${databasePath.replaceAll("\\", "/")}` };

const cleanup = () => {
  for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try {
      rmSync(path, { force: true });
    } catch (error) {
      console.error(`Could not remove temporary E2E resource ${path}:`, error);
      process.exitCode = 1;
    }
  }
};
process.on("exit", cleanup);

const portIsOccupied = await new Promise((resolve) => {
  const socket = createConnection({ host, port: Number(port) });
  const finish = (occupied) => {
    socket.removeAllListeners();
    socket.destroy();
    resolve(occupied);
  };
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
  socket.setTimeout(500, () => finish(false));
});
if (portIsOccupied) {
  console.error(`E2E backend port ${host}:${port} is already occupied.`);
  cleanup();
  process.exit(2);
}

const migration = spawnSync(uv, ["run", "alembic", "upgrade", "head"], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});
if (migration.status !== 0) {
  cleanup();
  process.exit(migration.status ?? 1);
}

const seed = spawnSync(uv, ["run", "python", "-m", "app.initialization"], {
  cwd: backendDirectory,
  env,
  stdio: "inherit",
});
if (seed.status !== 0) {
  cleanup();
  process.exit(seed.status ?? 1);
}

const server = spawn(uv, ["run", "uvicorn", "app.main:app", "--host", host, "--port", port], {
  cwd: backendDirectory,
  env,
  stdio: "inherit",
});
let stopping = false;
const stop = () => {
  if (!stopping) {
    stopping = true;
    server.kill();
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("SIGBREAK", stop);
server.on("error", (error) => {
  console.error("E2E backend process failed:", error);
  cleanup();
  process.exit(1);
});
server.on("exit", (code, signal) => {
  cleanup();
  process.exit(code ?? (signal ? 1 : 0));
});
