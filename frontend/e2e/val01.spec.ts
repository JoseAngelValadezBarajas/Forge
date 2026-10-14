import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const evidenceDirectory = resolve(process.cwd(), "test-results", "val01");

async function capture(page: Page, name: string) {
  mkdirSync(evidenceDirectory, { recursive: true });
  const path = `${evidenceDirectory}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  if (!existsSync(path)) throw new Error(`Evidence screenshot was not written: ${path}`);
}

async function createWorkspaceAndProject(page: Page, suffix: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  await page.getByLabel("Name").fill(`VAL01 Workspace ${suffix}`);
  await page.getByLabel("Description").fill("Planning MVP acceptance workspace");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByLabel("Project name").fill(`VAL01 Project ${suffix}`);
  await page.getByLabel("Project description").fill("A real local planning project");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: `VAL01 Project ${suffix}`, exact: true, level: 1 })).toBeVisible();
}

test("accepts Planning MVP journeys with real API and persisted SQLite state", async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const httpErrors: string[] = [];
  let expectedArchivedSaveError = false;
  let expectedConsoleErrors = 0;
  page.on("console", (entry) => {
    if (entry.type() === "error") {
      if (expectedArchivedSaveError && entry.text().includes("422")) expectedConsoleErrors += 1;
      else consoleErrors.push(entry.text());
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });
  const suffix = Date.now().toString();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await expect(page.getByText("Your workspace is ready", { exact: true })).toBeVisible();
  await expect(page.getByText("FND-02", { exact: true })).toHaveCount(0);
  await capture(page, "first-run");

  await createWorkspaceAndProject(page, suffix);
  const projectUrl = page.url();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByText(`VAL01 Project ${suffix}`, { exact: true }).first()).toBeVisible();
  await capture(page, "workspace-home");
  await page.getByText(`VAL01 Project ${suffix}`, { exact: true }).first().click();
  await capture(page, "project-overview");

  await page.getByRole("link", { name: "Open board", exact: true }).click();
  await page.getByRole("button", { name: "+ Epic", exact: true }).click();
  await page.getByLabel("Title").fill("Core planning");
  await page.getByLabel("Description").fill("Organize the first product slice");
  await page.getByRole("button", { name: "Create epic", exact: true }).click();

  await page.getByRole("button", { name: /Search or command/ }).click();
  await expect(page.getByRole("option", { name: "Create Feature" })).toBeVisible();
  await page.getByRole("option", { name: "Create Feature" }).click();
  await expect(page).toHaveURL(/\/features\?create=1$/);
  await page.getByLabel("Title").fill("Planning feature");
  await page.getByLabel("Goal").fill("Make the planning context durable");
  await page.getByLabel("Description").fill("A feature planned by a new user");
  await page.getByLabel("Epic").selectOption({ label: "Core planning" });
  await page.getByRole("button", { name: "Create feature", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Planning feature/, level: 1 })).toBeVisible();
  const featureUrl = page.url();

  for (const title of ["Task one", "Task two", "Task three"]) {
    await page.getByLabel("New task").fill(title);
    await page.locator("form.inline-add").first().getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: /Move task Task two down/ }).click();
  for (const description of ["Criterion one", "Criterion two", "Criterion three"]) {
    await page.getByLabel("New acceptance criterion").fill(description);
    await page.locator("form.inline-add").nth(1).getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(description, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: /Move criterion Criterion two down/ }).click();
  await page.getByLabel("Feature state").selectOption("ready");
  await page.getByRole("button", { name: "Save feature", exact: true }).click();
  await capture(page, "feature-detail");

  await page.goto(`${projectUrl}/features`);
  await page.getByRole("button", { name: "+ Feature", exact: true }).click();
  await page.getByLabel("Title").fill("Dependent feature");
  await page.getByLabel("Goal").fill("Provide a second planning record");
  await page.getByRole("button", { name: "Create feature", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Dependent feature/, level: 1 })).toBeVisible();
  const dependentFeatureUrl = page.url();
  await page.goto(featureUrl);
  await page.getByLabel("Dependency relationship").selectOption("blocks");
  const dependentOption = await page.getByLabel("Dependency feature").locator("option").filter({ hasText: "Dependent feature" }).getAttribute("value");
  await page.getByLabel("Dependency feature").selectOption(dependentOption!);
  await page.getByRole("button", { name: "Add dependency", exact: true }).click();
  await expect(page.getByText(/Dependent feature/).last()).toBeVisible();
  await page.goto(`${projectUrl}/board`);
  await expect(page.getByText("Planning feature", { exact: true })).toBeVisible();
  await capture(page, "board-populated");
  await page.goto(`${projectUrl}/features`);
  await expect(page.getByText("Planning feature", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Dependent feature", { exact: true })).toBeVisible();
  void dependentFeatureUrl;

  await page.goto(`${projectUrl}/decisions`);
  await page.getByRole("button", { name: "+ New decision", exact: true }).click();
  await page.getByLabel("Title").fill("Prefer explicit planning context");
  await page.getByLabel("Decision context").fill("Users need a durable planning record");
  await page.getByLabel("Decision", { exact: true }).fill("Keep planning records local-first");
  await page.getByLabel("Decision rationale").fill("Local state keeps the context inspectable");
  await page.getByLabel("Alternatives considered").fill("A remote-only planning service");
  await page.getByLabel("Tradeoffs").fill("Local data needs explicit backup later");
  await page.locator("form.fnd-form").getByRole("button", { name: "Create decision", exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator(".fnd-history-detail").getByText("Users need a durable planning record", { exact: false })).toBeVisible();
  await expect(page.locator(".fnd-history-detail").getByText("A remote-only planning service", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Accept decision", exact: true }).click();
  await expect(page.getByText("accepted", { exact: true })).toBeVisible();
  await capture(page, "decisions");

  await page.goto(`${projectUrl}/invariants`);
  await page.getByRole("button", { name: "+ New invariant", exact: true }).click();
  await page.getByLabel("Title").fill("Project planning is explicit");
  await page.getByLabel("Statement").fill("Every plan names its intended outcome");
  await page.getByLabel("Rationale").fill("The team must be able to review intent");
  await page.locator("form.fnd-form").getByRole("button", { name: "Create invariant", exact: true }).click();
  await page.getByRole("button", { name: "+ New invariant", exact: true }).click();
  await page.getByLabel("Title").fill("Feature planning is honest");
  const featureInvariantOption = await page.getByLabel("Scope").locator("option").filter({ hasText: "Planning feature" }).getAttribute("value");
  await page.getByLabel("Scope").selectOption(featureInvariantOption!);
  await page.getByLabel("Statement").fill("Planning does not claim implementation evidence");
  await page.getByLabel("Rationale").fill("Readiness must remain separate from delivery verification");
  await page.locator("form.fnd-form").getByRole("button", { name: "Create invariant", exact: true }).click();
  await expect(page.getByText("Every plan names its intended outcome", { exact: true })).toBeVisible();
  await expect(page.getByText("Planning does not claim implementation evidence", { exact: true })).toBeVisible();
  await capture(page, "invariants");

  await page.goto(featureUrl);
  await expect(page.getByText("NOT READY", { exact: true })).toBeVisible();
  await expect(page.getByText("CURRENT PREVIEW", { exact: true })).toBeVisible();
  await expect(page.getByText("Every plan names its intended outcome", { exact: true })).toBeVisible();
  await expect(page.getByText("The team must be able to review intent", { exact: false })).toBeVisible();
  await capture(page, "readiness-not-ready");

  await page.getByLabel("Decision to link").selectOption({ label: "Prefer explicit planning context" });
  await page.getByRole("button", { name: "Link", exact: true }).click();
  const acknowledgementButtons = page.getByRole("button", { name: "Acknowledge review", exact: true });
  await expect(acknowledgementButtons).toHaveCount(2);
  await acknowledgementButtons.nth(0).click();
  await acknowledgementButtons.nth(0).click();
  await expect(page.getByText("READY TO START", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Evaluate & save", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(page.getByText("Saved evaluation snapshots", { exact: true })).toBeVisible();
  await capture(page, "readiness-ready");

  await page.getByLabel("Feature goal").fill("A changed planning context requires reevaluation");
  await page.getByRole("button", { name: "Save feature", exact: true }).click();
  await expect(page.locator(".history-stale")).toHaveCount(1);
  await expect(page.getByText("STALE", { exact: true })).toBeVisible();
  await capture(page, "readiness-stale");
  await page.getByRole("button", { name: "Preview current", exact: true }).click();
  await expect(page.getByText("STALE", { exact: true })).toBeVisible();
  await expect(page.locator(".history-row")).toHaveCount(1);

  await page.goto(projectUrl);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByText("Project archived.", { exact: true })).toBeVisible();
  await page.goto(featureUrl);
  expectedArchivedSaveError = true;
  await page.getByRole("button", { name: "Evaluate & save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("read-only");
  expectedArchivedSaveError = false;
  await page.getByRole("button", { name: "Preview current", exact: true }).click();
  await expect(page.getByText("CURRENT PREVIEW", { exact: true })).toBeVisible();
  await page.goto(projectUrl);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Project restored.", { exact: true })).toBeVisible();

  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  await page.getByLabel("Name").fill(`VAL01 Isolated ${suffix}`);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByText("Nothing here yet", { exact: true })).toBeVisible();
  await expect(page.getByText(`VAL01 Project ${suffix}`, { exact: true })).toHaveCount(0);
  console.log(`VAL01_HTTP_ERRORS ${JSON.stringify(httpErrors)}`);
  expect(httpErrors.filter((item) => item.startsWith("404 "))).toEqual([]);
  expect(httpErrors.filter((item) => item.startsWith("422 "))).toHaveLength(1);
  expect(expectedConsoleErrors).toBe(1);
  expect(consoleErrors).toEqual([]);
});

test.describe("mobile evidence", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps keyboard focus and layout usable on mobile", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (entry) => {
    if (entry.type() === "error") consoleErrors.push(entry.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBeTruthy();
  const commandTrigger = page.getByRole("button", { name: /Search or command/ });
  await commandTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
  await expect(commandTrigger).toBeFocused();
  mkdirSync(evidenceDirectory, { recursive: true });
  const path = `${evidenceDirectory}/mobile-home.png`;
  await page.screenshot({ path, fullPage: true });
  expect(existsSync(path)).toBeTruthy();
  expect(consoleErrors).toEqual([]);
  });
});
