import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function createTemporaryRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-fnd04-repository-"));
  const run = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  };
  run(["init", "--initial-branch=main"]);
  writeFileSync(join(root, "README.md"), "FND-04 fixture\n", "utf8");
  run(["add", "README.md"]);
  run(["-c", "user.name=Forge Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
  return root;
}

test("connects, observes and snapshots an optional local repository", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const repositoryPath = createTemporaryRepository();

  try {
    const suffix = Date.now().toString();
    await page.goto("/projects");
    await page.getByRole("button", { name: /New project/ }).click();
    await page.getByLabel("Project name").fill(`FND04 Project ${suffix}`);
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page.getByRole("heading", { name: `FND04 Project ${suffix}`, level: 1 })).toBeVisible();
    const projectId = new URL(page.url()).pathname.split("/")[2];

    await page.getByRole("link", { name: "Open inventory", exact: true }).click();
    await page.getByLabel("Local repository path").fill(repositoryPath);
    await page.getByRole("button", { name: "Connect local repo", exact: true }).click();
    await expect(page.getByText("CONNECTED", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Observe now", exact: true }).click();
    await expect(page.getByText("Last observation", { exact: false })).toBeVisible();

    await page.goto(`/projects/${projectId}/features`);
    await page.getByRole("button", { name: "+ Feature", exact: true }).click();
    await page.getByLabel("Title").fill("Context Feature");
    await page.getByLabel("Goal").fill("Preserve deterministic local context");
    await page.getByRole("button", { name: "Create feature", exact: true }).click();
    await expect(page.getByRole("heading", { name: /FEAT-001.*Context Feature/, level: 1 })).toBeVisible();
    const featureId = new URL(page.url()).pathname.split("/")[4];

    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Open Feature Context");
    await page.getByRole("option", { name: /Open Feature Context/ }).click();
    await expect(page.getByRole("heading", { name: "Context package", level: 1 })).toBeVisible();
    const repositoryOption = await page.getByLabel("Repository to link").locator("option").nth(1).getAttribute("value");
    await page.getByLabel("Repository to link").selectOption(repositoryOption!);
    await page.getByRole("button", { name: "Link", exact: true }).click();
    await expect(page.getByText(/forge-fnd04-repository-/)).toBeVisible();
    await page.getByRole("button", { name: "Preview package", exact: true }).click();
    await expect(page.getByText("forge-context-v1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Generate & save", exact: true }).click();
    await expect(page.locator(".context-history .history-row")).toHaveCount(1);
    await page.screenshot({ path: "test-results/fnd04-context-package.png", fullPage: true });

    writeFileSync(join(repositoryPath, "untracked.txt"), "metadata change\n", "utf8");
    await page.goto(`/projects/${projectId}/repositories`);
    await page.getByRole("button", { name: "Observe now", exact: true }).click();
    await page.goto(`/projects/${projectId}/features/${featureId}/context`);
    await page.getByRole("button", { name: "Preview package", exact: true }).click();
    await page.getByRole("button", { name: "Generate & save", exact: true }).click();
    await expect(page.locator(".context-history .history-row")).toHaveCount(2);

    await page.goto(`/projects/${projectId}/repositories`);
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(page.getByText("DISCONNECTED", { exact: true })).toBeVisible();
    await page.goto(`/projects/${projectId}/features/${featureId}/context`);
    await expect(page.locator(".context-history .history-row")).toHaveCount(2);
    expect(consoleErrors).toEqual([]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});
