import { expect, test } from "@playwright/test";

test("creates a feature, task and acceptance criterion in Chromium", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const suffix = Date.now().toString();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  await page.getByLabel("Name").fill(`FND02 Workspace ${suffix}`);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByLabel("Project name").fill(`Planning Project ${suffix}`);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Planning Project ${suffix}`, exact: true, level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Open board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Project Board", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Feature", exact: true }).click();
  await page.getByLabel("Title").fill("Persistent planning slice");
  await page.getByLabel("Goal").fill("Keep product intent durable");
  await page.getByRole("button", { name: "Create feature", exact: true }).click();
  await expect(page.getByRole("heading", { name: "FEAT-001 · Persistent planning slice", exact: true, level: 1 })).toBeVisible();

  await page.getByLabel("New task").fill("Persist task state");
  await page.locator("form.inline-add").first().getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Persist task state", { exact: true })).toBeVisible();
  await page.getByLabel("New acceptance criterion").fill("The criterion is user-declared");
  await page.locator("form.inline-add").nth(1).getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("The criterion is user-declared", { exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
