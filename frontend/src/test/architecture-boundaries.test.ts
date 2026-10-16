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

function expectOnlyIssue(output: string, code: string) {
  const issues = output.match(/^ERROR [^\r\n]+$/gm) ?? [];
  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain(code);
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

  it("rejects a shared module importing a feature implementation", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-shared-feature-boundary-"));
    validProject();
    write(
      "shared/ui/BadPanel.tsx",
      "import '../../features/planning/pages/PlanningPage';\n",
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expectOnlyIssue(result.output, "shared-boundary");
  });

  it("rejects a shared module importing the app", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-shared-app-boundary-"));
    validProject();
    write("shared/ui/BadPanel.tsx", "import '../../app/router';\n");

    const result = runChecker();

    expect(result.status).toBe(1);
    expectOnlyIssue(result.output, "shared-boundary");
  });

  it("rejects a feature importing another feature's private implementation", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-private-feature-boundary-"));
    validProject();
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
    expectOnlyIssue(result.output, "private-feature-import");
  });

  it("rejects feature-to-app dependencies", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-api-"));
    validProject();
    write(
      "features/planning/pages/BadPage.tsx",
      "import App from '../../../app/App'; export const page = App;\n",
    );
    write("app/App.tsx", "export default function App() { return null; }\n");

    const result = runChecker();

    expect(result.status).toBe(1);
    expectOnlyIssue(result.output, "feature-to-app");
  });

  it.each([
    ["react", "react"],
    ["react subpath", "react/jsx-runtime"],
    ["react-dom", "react-dom"],
    ["react-dom subpath", "react-dom/client"],
  ])("rejects a feature API runtime import of %s independently", (_label, specifier) => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-react-api-"));
    validProject();
    write(
      "features/planning/api/bad.ts",
      `import * as runtime from '${specifier}'; export const bad = runtime;\n`,
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expectOnlyIssue(
      result.output,
      `api-ui-import: features/planning/api/bad.ts imports UI dependency ${specifier}`,
    );
  });

  it("allows type-only React references from a feature API", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-type-api-"));
    validProject();
    write(
      "features/planning/api/types.ts",
      "import type { ReactNode } from 'react'; export type ViewContent = ReactNode;\n",
    );

    const result = runChecker();

    expect(result.status).toBe(0);
    expect(result.output).toContain("Architecture boundaries pass");
  });

  it("rejects a feature API import of a private UI implementation independently", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-private-ui-api-"));
    validProject();
    write(
      "features/planning/api/bad.ts",
      "import { PlanningPage } from '../pages/PlanningPage'; export const bad = PlanningPage;\n",
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expectOnlyIssue(
      result.output,
      "api-ui-import: features/planning/api/bad.ts",
    );
  });

  it("does not treat type-only feature imports as runtime cycles", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-type-cycle-"));
    validProject();
    write(
      "features/planning/index.ts",
      "import type { ReadinessModel } from '../readiness'; export type PlanningModel = { readiness?: ReadinessModel };\n",
    );
    write(
      "features/readiness/index.ts",
      "import type { PlanningModel } from '../planning'; export type ReadinessModel = { planning?: PlanningModel };\n",
    );

    const result = runChecker();

    expect(result.status).toBe(0);
    expect(result.output).not.toContain("runtime-cycle");
  });

  it("rejects runtime cycles", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-cycle-"));
    validProject();
    write(
      "features/planning/index.ts",
      "import { readiness } from '../readiness'; export const planning = readiness;\n",
    );
    write(
      "features/readiness/index.ts",
      "import { planning } from '../planning'; export const readiness = planning;\n",
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expectOnlyIssue(result.output, "runtime-cycle");
  });

  it("rejects obsolete root milestone modules", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-milestone-"));
    validProject();
    write("fnd03.tsx", "export const legacy = true;\n");

    const result = runChecker();

    expect(result.status).toBe(1);
    expectOnlyIssue(result.output, "milestone-module");
  });

  it("rejects duplicate fetch transport outside the shared API client", () => {
    sourceRoot = mkdtempSync(path.join(tmpdir(), "forge-architecture-transport-"));
    validProject();
    write(
      "features/delivery/pages/DeliveryPage.tsx",
      "export async function load() { return globalThis.fetch('/api/health'); }\n",
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expectOnlyIssue(result.output, "duplicate-transport");
  });
});
