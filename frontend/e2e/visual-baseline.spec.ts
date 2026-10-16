import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

type Identified = { id: string; name?: string; version?: number; current_revision?: number; revision?: number };

async function create<T extends Identified>(
  page: Page,
  path: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const response = await page.request.post(path, data ? { data } : {});
  expect(response.status(), `${path} should create its fixture`).toBe(201);
  return (await response.json()) as T;
}

async function complete(
  page: Page,
  path: string,
  data?: Record<string, unknown>,
) {
  const response = await page.request.post(path, data ? { data } : {});
  expect(response.status(), `${path} should complete`).toBeLessThan(300);
}

async function capture(page: Page, name: string) {
  // The timestamp is masked, but its localized glyph widths still change the
  // mask geometry. Normalize only this already-masked fixture datum before capture.
  await page.locator(".repository-card small").evaluateAll((elements) => {
    for (const element of elements)
      element.textContent = "Last observation 10/16/2026, 1:00:00 AM";
  });
  const options = {
    animations: "disabled" as const,
    caret: "hide" as const,
    fullPage: true,
    scale: "css" as const,
    mask: [
      page.locator(".repository-card h3"),
      page.locator(".repository-card small"),
      page.locator(".context-links .dependency-list li span"),
      page.locator(".context-history .history-row span:nth-child(1)"),
      page.locator(".context-history .history-row span:nth-child(3)"),
      page.locator(".fnd05-fingerprint"),
      page.locator(".fnd05-run-identity > p:first-of-type"),
      page.locator(".fnd05-handoff-source > p:first-of-type"),
      page.locator(".fnd05-card .mono-label"),
      page.locator(".fnd05-card p"),
      page.locator(".fnd05-revision-choice span:nth-child(2)"),
      page.locator(".fnd05-revision-choice span:nth-child(3)"),
      page.locator(".fnd05-revision > span:nth-child(2)"),
      page.locator(".fnd05-revision pre"),
      page.locator(".fnd06-list .mono-label").filter({ hasText: /[0-9a-f]{10,}/i }),
      page.locator(".fnd06-history-row .mono-label").filter({ hasText: /[0-9a-f]{10,}/i }),
      page.locator(".mono-label").filter({ hasText: "Fingerprint" }),
      page.locator(".project-overview-header .eyebrow").filter({ hasText: /RC-/ }),
      page.locator(".fnd06-scope-grid > div:nth-child(2) li"),
      page.locator(".fnd06-multi").filter({ has: page.getByText("Pinned Context Packages", { exact: true }) }).locator(".fnd06-option"),
      page.locator(".fnd06-multi").filter({ has: page.getByText("Published Handoff revisions", { exact: true }) }).locator(".fnd06-option"),
    ],
  };
  if (process.platform === "win32") {
    await expect(page).toHaveScreenshot(`${name}.png`, options);
  }
  // Keep each current-render capture separate from the approved snapshots.
  const candidateDirectory = "artifacts/rfx-org-03b/candidate";
  mkdirSync(candidateDirectory, { recursive: true });
  await page.screenshot({ path: `${candidateDirectory}/${name}.png`, ...options });
}

async function ready(page: Page, heading: string) {
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("h1")).toContainText(heading);
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[role="status"]').filter({ hasText: /Loading/ })).toHaveCount(0);
}

test("captures deterministic visual baselines for shell and representative product surfaces", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    if (!localStorage.getItem("rfx-org-03b-visual-initialized")) {
      localStorage.setItem("forge-theme", "dark");
      localStorage.removeItem("forge-active-workspace");
      localStorage.setItem("rfx-org-03b-visual-initialized", "1");
    }
  });

  const workspaces = (await (await page.request.get("/api/workspaces")).json()) as Array<Identified>;
  const workspace = workspaces.find((candidate) => candidate.name === "Local Workspace");
  expect(workspace?.id).toBeTruthy();
  await page.addInitScript((workspaceId: string) => {
    window.localStorage.setItem("forge-active-workspace", workspaceId);
  }, workspace!.id);
  const project = await create<Identified>(page, `/api/workspaces/${workspace.id}/projects`, {
    name: "RFX-ORG-03B Visual Fixture",
    description: "Deterministic local browser fixture for visual parity checks.",
  });
  const base = `/api/workspaces/${workspace.id}/projects/${project.id}`;
  const epic = await create<Identified>(page, `${base}/epics`, {
    title: "Planning foundation",
    description: "A stable visual fixture epic.",
  });
  const feature = await create<Identified>(page, `${base}/features`, {
    title: "Traceable planning context",
    description: "A representative feature detail for visual review.",
    goal: "Keep planning context inspectable.",
    epic_id: epic.id,
    status: "ready",
    priority: "high",
  });
  const dependent = await create<Identified>(page, `${base}/features`, {
    title: "Delivery planning",
    goal: "Represent a second board card.",
    epic_id: epic.id,
  });
  await create<Identified>(page, `${base}/features/${feature.id}/tasks`, {
    title: "Review the saved context",
    description: "A task shown in Feature Detail.",
  });
  const criterion = await create<Identified>(page, `${base}/features/${feature.id}/acceptance-criteria`, {
    description: "The plan remains visible after navigation.",
  });
  await create<Identified>(page, `${base}/dependencies`, {
    blocking_feature_id: feature.id,
    blocked_feature_id: dependent.id,
  });
  const decision = await create<Identified>(page, `${base}/decisions`, {
    title: "Keep planning local-first",
    context: "The first release should work without external accounts.",
    decision: "Store the planning record in the local Forge database.",
    rationale: "The user should retain direct control over local project context.",
    alternatives_considered: "Use a hosted-only planning service.",
    tradeoffs: "Local state needs explicit backup and portability later.",
  });
  await complete(page, `${base}/decisions/${decision.id}/accept`);
  const invariant = await create<Identified>(page, `${base}/invariants`, {
    title: "Planning stays explicit",
    statement: "A plan must not be presented as implementation evidence.",
    rationale: "Readiness and delivery verification are separate records.",
    feature_id: feature.id,
  });
  await complete(page, `${base}/features/${feature.id}/invariants/${invariant.id}/acknowledge`, {
    expected_revision: invariant.revision ?? 1,
  });

  const context = await create<Identified>(page, `${base}/features/${feature.id}/context/packages`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/workbench");
  await ready(page, "Workbench");
  await capture(page, "dark-workbench");
  await page.goto("/workbench/runs");
  await ready(page, "Agent Runs");
  await capture(page, "dark-runs");

  const run = await create<Identified>(page, `${base}/runs`, {
    feature_id: feature.id,
    context_package_id: context.id,
    title: "Local planning review",
    description: "A declared manual work record for the visual fixture.",
    executor_type: "human",
    executor_label: "Visual fixture",
  });
  const handoff = await create<Identified>(page, `${base}/runs/${run.id}/handoffs`, {
    title: "Planning review handoff",
    summary: "The planning context is ready for a human review.",
    outcomes: "A feature, task, and acceptance criterion were recorded.",
    blockers: "No delivery verification was performed.",
    questions: "Does the saved context capture the intended scope?",
    next_actions: "Review the plan and decide whether to begin implementation.",
    references: "Local visual fixture only.",
  });
  await complete(page, `${base}/handoffs/${handoff.id}/ready`, {
    expected_version: handoff.version ?? 1,
  });
  const evidence = await create<Identified>(page, `${base}/evidence`, {
    feature_id: feature.id,
    acceptance_criterion_id: criterion.id,
    evidence_type: "reported_test_result",
    title: "Declared test report",
    description: "A reported result, not independently verified.",
    source_kind: "safe_link",
    source_reference: "https://example.test/report",
    declared_outcome: "PASS",
  });
  const verification = await create<Identified>(page, `${base}/verifications/evaluate`, {
    rule_id: "V02",
    context_package_id: context.id,
  });
  const candidate = await create<Identified>(page, `${base}/release-candidates`, {
    title: "Visual review candidate",
    intended_version: "0.0-visual",
    feature_ids: [feature.id],
    context_package_ids: [context.id],
    evidence_ids: [evidence.id],
    verification_ids: [verification.id],
    handoff_revision_ids: [],
  });

  const temporaryRepository = mkdtempSync(join(tmpdir(), "forge-visual-"));
  try {
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: temporaryRepository, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
    };
    git(["init", "--initial-branch=main"]);
    writeFileSync(join(temporaryRepository, "README.md"), "Temporary visual fixture.\n", "utf8");
    git(["add", "README.md"]);
    git(["-c", "user.name=Forge Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
    const repository = await create<Identified>(page, `${base}/repositories`, { root_path: temporaryRepository });
    await complete(page, `${base}/repositories/${repository.id}/observe`);
    await create<Identified>(page, `${base}/features/${feature.id}/repositories`, { repository_id: repository.id });

    const routes: Array<[string, string, string]> = [
      ["dark-home", "/", "Workspace"],
      ["dark-projects", "/projects", "Projects"],
      ["dark-project-overview", `/projects/${project.id}`, "RFX-ORG-03B Visual Fixture"],
      ["dark-board", `/projects/${project.id}/board`, "Project Board"],
      ["dark-feature-detail", `/projects/${project.id}/features/${feature.id}`, "Traceable planning context"],
      ["dark-decisions", `/projects/${project.id}/decisions`, "Decisions"],
      ["dark-invariants", `/projects/${project.id}/invariants`, "Invariants"],
      ["dark-repositories", `/projects/${project.id}/repositories`, "Repositories"],
      ["dark-context-package", `/projects/${project.id}/features/${feature.id}/context`, "Context package"],
      ["dark-run-detail", `/projects/${project.id}/runs/${run.id}`, "Run Detail & Timeline"],
      ["dark-handoff-queue", "/workbench/handoffs", "Handoff Queue"],
      ["dark-handoff-detail", `/projects/${project.id}/handoffs/${handoff.id}`, "Handoff Review & Acknowledge"],
      ["dark-delivery", `/projects/${project.id}/delivery`, "Delivery"],
      ["dark-evidence", `/projects/${project.id}/delivery/evidence`, "Evidence inventory"],
      ["dark-verification", `/projects/${project.id}/delivery/verifications`, "Verification center"],
      ["dark-release-candidate", `/projects/${project.id}/delivery/release-candidates/${candidate.id}`, "Release candidate"],
    ];
    for (const [name, route, heading] of routes) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await ready(page, heading);
      await capture(page, name);
    }

    await page.goto(`/projects/${project.id}/board`);
    await ready(page, "Project Board");
    const paletteTrigger = page.getByRole("button", { name: /Search or command/ });
    await paletteTrigger.focus();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Search commands" })).toBeFocused();
    await capture(page, "dark-command-palette");
    await page.keyboard.press("Escape");
    await expect(paletteTrigger).toBeFocused();

    for (const [name, route, heading] of [
      ["light-home", "/", "Workspace"],
      ["light-board", `/projects/${project.id}/board`, "Project Board"],
      ["light-feature-detail", `/projects/${project.id}/features/${feature.id}`, "Traceable planning context"],
      ["light-delivery", `/projects/${project.id}/delivery`, "Delivery"],
    ]) {
      await page.evaluate(() => localStorage.setItem("forge-theme", "light"));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await ready(page, heading);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await capture(page, name);
    }

    for (const [name, route, heading] of [
      ["mobile-home", "/", "Workspace"],
      ["mobile-project-overview", `/projects/${project.id}`, "RFX-ORG-03B Visual Fixture"],
      ["mobile-board", `/projects/${project.id}/board`, "Project Board"],
      ["mobile-context-package", `/projects/${project.id}/features/${feature.id}/context`, "Context package"],
      ["mobile-handoff", `/projects/${project.id}/handoffs/${handoff.id}`, "Handoff Review & Acknowledge"],
      ["mobile-delivery", `/projects/${project.id}/delivery/evidence`, "Evidence inventory"],
    ]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      await ready(page, heading);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.right > innerWidth + 1;
          })
          .slice(0, 12)
          .map((element) => ({
            tag: element.tagName,
            className: String(element.className),
            text: element.innerText.slice(0, 48),
            right: Math.round(element.getBoundingClientRect().right),
            width: Math.round(element.getBoundingClientRect().width),
          })),
      }));
      console.log(`MOBILE_OVERFLOW ${name} ${JSON.stringify(overflow)}`);
      if (name === "mobile-board") {
        expect(overflow.scrollWidth).toBeGreaterThan(390);
        expect(overflow.offenders[0]?.className).toBe("kanban-board");
      } else {
        expect(overflow.scrollWidth).toBeLessThanOrEqual(390);
      }
      if (name === "mobile-handoff") {
        // The paragraph is already masked: normalize opaque UUID glyph widths so
        // their proportional-font wrapping cannot shift the full-page baseline.
        await page.locator(".fnd05-handoff-source > p:first-of-type").evaluate((element) => {
          element.textContent =
            "Run 00000000-0000-0000-0000-000000000000 · Pinned Context Package 00000000-0000-0000-0000-000000000000";
        });
      }
      await capture(page, name);
    }

    await page.goto("/");
    await ready(page, "Workspace");
    const themeToggle = page.locator(".theme-toggle");
    if (await page.locator("html").getAttribute("data-theme") !== "dark") await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("forge-theme"))).toBe("dark");
    const persistedPage = await page.context().newPage();
    await persistedPage.goto("/");
    await ready(persistedPage, "Workspace");
    await expect(persistedPage.locator("html")).toHaveAttribute("data-theme", "dark");
    await persistedPage.close();
  } finally {
    rmSync(temporaryRepository, { recursive: true, force: true });
  }
});
