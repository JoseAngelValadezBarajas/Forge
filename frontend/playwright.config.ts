import { readFileSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

type ForgeConfig = { host: string; backendPort: number; frontendPort: number };
const forgeConfig = JSON.parse(
  readFileSync(new URL("../forge.config.json", import.meta.url), "utf-8"),
) as ForgeConfig;
const backendPort = Number(process.env.FORGE_BACKEND_PORT ?? forgeConfig.backendPort);
const frontendPort = Number(process.env.FORGE_FRONTEND_PORT ?? forgeConfig.frontendPort);
const localBaseUrl = `http://${forgeConfig.host}:${frontendPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Stability must come from deterministic tests, not retries that mask flakes.
  retries: 0,
  reporter: "html",
  use: {
    baseURL: localBaseUrl,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `node ../frontend/e2e/start-backend.mjs ${forgeConfig.host} ${backendPort}`,
      cwd: "../backend",
      url: `http://${forgeConfig.host}:${backendPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --host ${forgeConfig.host}`,
      cwd: ".",
      url: localBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

