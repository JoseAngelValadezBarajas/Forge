import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { clearTimeout, setTimeout as schedule } from "node:timers";
import { fileURLToPath } from "node:url";
import process from "node:process";

const frontendRoot = fileURLToPath(new URL("../frontend/", import.meta.url));
const requests = [];
const sockets = new Set();
const sentinel = createServer((request, response) => {
  requests.push({ method: request.method ?? "GET", url: request.url ?? "/" });
  if (request.url === "/api/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "Forge" }));
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end("{}");
});
sentinel.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

const listen = () => new Promise((resolve) => sentinel.listen(0, "127.0.0.1", resolve));
await listen();
const address = sentinel.address();
if (!address || typeof address === "string") throw new Error("Could not allocate sentinel port");
const backendPort = address.port;
const frontendPort = backendPort + 1;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : npm;
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", `${npm} run e2e -- e2e/isolation-probe.spec.ts --workers=1`]
  : ["run", "e2e", "--", "e2e/isolation-probe.spec.ts", "--workers=1"];
const result = await new Promise((resolve) => {
  const child = spawn(command, args, {
    cwd: frontendRoot,
    env: {
      ...process.env,
      CI: "1",
      FORGE_BACKEND_PORT: String(backendPort),
      FORGE_FRONTEND_PORT: String(frontendPort),
    },
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
  });
  let settled = false;
  const timeout = schedule(() => {
    if (settled) return;
    settled = true;
    child.kill();
    resolve({ status: null, error: { code: "ETIMEDOUT" } });
  }, 120_000);
  child.once("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    resolve({ status: null, error });
  });
  child.once("close", (status, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    resolve({ status, error: signal ? { code: signal } : undefined });
  });
});
for (const socket of sockets) socket.destroy();
await new Promise((resolve) => sentinel.close(resolve));

const writes = requests.filter((request) => ["POST", "PUT", "PATCH", "DELETE"].includes(request.method));
if (result.error || result.status === 0 || writes.length > 0) {
  console.error(
    `E2E isolation failed: status=${result.status}, error=${result.error?.code ?? "none"}, writes=${writes.length}`,
  );
  process.exit(1);
}
console.log("E2E isolation negative test PASS: pre-existing server received no writes.");
