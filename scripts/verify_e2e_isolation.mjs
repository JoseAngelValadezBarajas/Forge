import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const frontendRoot = fileURLToPath(new URL("../frontend/", import.meta.url));
const requests = [];
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

const listen = () => new Promise((resolve) => sentinel.listen(0, "127.0.0.1", resolve));
await listen();
const address = sentinel.address();
if (!address || typeof address === "string") throw new Error("Could not allocate sentinel port");
const backendPort = address.port;
const frontendPort = backendPort + 1;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npm,
  ["run", "e2e", "--", "e2e/isolation-probe.spec.ts", "--workers=1"],
  {
    cwd: frontendRoot,
    env: {
      ...process.env,
      CI: "1",
      FORGE_BACKEND_PORT: String(backendPort),
      FORGE_FRONTEND_PORT: String(frontendPort),
    },
    encoding: "utf8",
    stdio: "inherit",
  },
);
await new Promise((resolve) => sentinel.close(resolve));

const writes = requests.filter((request) => ["POST", "PUT", "PATCH", "DELETE"].includes(request.method));
if (result.status === 0 || writes.length > 0) {
  console.error(`E2E isolation failed: status=${result.status}, writes=${writes.length}`);
  process.exit(1);
}
console.log("E2E isolation negative test PASS: pre-existing server received no writes.");
