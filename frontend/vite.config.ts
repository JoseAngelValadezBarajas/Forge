import { readFileSync } from "node:fs";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

type ForgeConfig = { host: string; backendPort: number; frontendPort: number };
const forgeConfig = JSON.parse(
  readFileSync(new URL("../forge.config.json", import.meta.url), "utf-8"),
) as ForgeConfig;
const backendPort = Number(process.env.FORGE_BACKEND_PORT ?? forgeConfig.backendPort);
const frontendPort = Number(process.env.FORGE_FRONTEND_PORT ?? forgeConfig.frontendPort);

export default defineConfig({
  plugins: [react()],
  server: {
    host: forgeConfig.host,
    port: frontendPort,
    proxy: {
      "/api": `http://${forgeConfig.host}:${backendPort}`,
    },
  },
});

