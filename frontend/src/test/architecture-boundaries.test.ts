/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const checker = path.resolve(
  process.cwd(),
  "scripts/check-architecture-boundaries.mjs",
);
let sourceRoot = "";

function write(relativePath: string, source: string) {
  const destination = path.join(sourceRoot, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, source, "utf8");
}

function runChecker() {
  const result = spawnSync(process.execPath, [checker, "--root", sourceRoot], {
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function validProject() {
  write(
    "shared/api/client.ts",
    "export async function request() { return {}; }\n",
  );
  write(
    "features/planning/api/index.ts",
    "import { request } from '../../../shared/api/client'; export const planningApi = { request };\n",
  );
  write(
    "features/planning/pages/PlanningPage.tsx",
    "import { planningApi } from '../api'; export function PlanningPage() { return planningApi.request(); }\n",
  );
  write(
    "features/planning/index.ts",
    "export { PlanningPage } from './pages/PlanningPage';\n",
  );
  write(
    "app/router.tsx",
    "import { PlanningPage } from '../features/planning'; export const route = PlanningPage;\n",
  );
  write("api.ts", "export { planningApi } from './features/planning/api';\n");
}

describe("frontend architecture boundary checker", () => {
  afterEach(() => {
    if (sourceRoot) rmSync(sourceRoot, { recursive: true, force: true });
    sourceRoot = "";
  });

  it("accepts the intended app-to-public-feature and shared transport directions", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-pass-"));
    validProject();

    const result = runChecker();

    expect(result.status).toBe(0);
    expect(result.output).toContain("Architecture boundaries pass");
  });

  it("rejects shared-to-feature/app and feature-to-private-feature imports", () => {
    sourceRoot = mkdtempSync(
      path.join(tmpdir(), "forge-architecture-boundary-"),
    );
    validProject();
    write(
      "shared/ui/BadPanel.tsx",
      "import '../../features/planning/pages/PlanningPage'; import '../../app/router';\n",
    );
    write(
      "features/planning/pages/BadPage.tsx",
      "import '../../repositories/pages/RepositoriesPage';\n",
    );
    write(
      "features/repositories/pages/RepositoriesPage.tsx",
      "export const RepositoriesPage = true;\n",
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expect(result.output).toContain("shared-boundary");
    expect(result.output).toContain("private-feature-import");
  });

  it("rejects feature-to-app and React UI dependencies from feature APIs", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-api-"));
    validProject();
    write(
      "features/planning/api/bad.ts",
      "import React from 'react'; import { PlanningPage } from '../pages/PlanningPage'; import { PageFrame } from '../../../shared/ui/PageFrame'; export const bad = [React, PlanningPage, PageFrame];\n",
    );
    write(
      "shared/ui/PageFrame.tsx",
      "export function PageFrame() { return null; }\n",
    );
    write(
      "features/planning/pages/BadPage.tsx",
      "import App from '../../../app/App'; export const page = App;\n",
    );
    write("app/App.tsx", "export default function App() { return null; }\n");

    const result = runChecker();

    expect(result.status).toBe(1);
    expect(result.output).toContain("api-ui-import");
    expect(result.output).toContain("feature-to-app");
  });

  it("rejects runtime cycles, root milestone modules and duplicate fetch transport", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-cycle-"));
    validProject();
    write(
      "features/planning/index.ts",
      "import type { ReadinessType } from '../readiness'; import { readiness } from '../readiness'; export const planning = readiness as ReadinessType;\n",
    );
    write(
      "features/readiness/index.ts",
      "import { planning } from '../planning'; export const readiness = planning;\n",
    );
    write("fnd03.tsx", "export const legacy = true;\n");
    write(
      "features/delivery/pages/DeliveryPage.tsx",
      "export async function load() { return globalThis.fetch('/api/health'); }\n",
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expect(result.output).toContain("runtime-cycle");
    expect(result.output).toContain("milestone-module");
    expect(result.output).toContain("duplicate-transport");
  });
});
