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
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: localBaseUrl,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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

