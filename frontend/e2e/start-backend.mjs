import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

const host = process.argv[2] ?? "127.0.0.1";
const port = process.argv[3] ?? "8000";
const backendDirectory = process.cwd();
const projectRoot = join(backendDirectory, "..");
const uv = process.platform === "win32" ? "uv.exe" : "uv";
const databasePath = join(tmpdir(), `forge-fnd01-e2e-${process.pid}.db`);
const env = { ...process.env, FORGE_DATABASE_URL: `sqlite:///${databasePath.replaceAll("\\", "/")}` };

const migration = spawnSync(uv, ["run", "alembic", "upgrade", "head"], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});
if (migration.status !== 0) process.exit(migration.status ?? 1);

const seed = spawnSync(uv, ["run", "python", "-m", "app.initialization"], {
  cwd: backendDirectory,
  env,
  stdio: "inherit",
});
if (seed.status !== 0) process.exit(seed.status ?? 1);

const server = spawn(uv, ["run", "uvicorn", "app.main:app", "--host", host, "--port", port], {
  cwd: backendDirectory,
  env,
  stdio: "inherit",
});
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
