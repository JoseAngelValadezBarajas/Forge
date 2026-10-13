import { expect, test } from "@playwright/test";

test("Forge opens, navigates, toggles theme, and has no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await expect(page.getByText("Your workspace is ready")).toBeVisible();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(consoleErrors).toEqual([]);
});

test("health endpoint is available through the local backend", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toMatchObject({ status: "ok", service: "Forge" });
});

test("manages workspaces and projects with persisted isolation", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();

  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  await page.getByLabel("Name").fill("E2E Workspace");
  await page.getByLabel("Description").fill("Browser verification workspace");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("button.workspace-switcher")).toHaveText(/E2E Workspace/);

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByLabel("Project name").fill("Browser Project");
  await page.getByLabel("Project description").fill("Created through Chromium");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Browser Project", exact: true, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Edit project" }).click();
  await page.getByLabel("Project name").fill("Browser Project Updated");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Browser Project Updated", exact: true, level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Browser Project Updated", exact: true, level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Projects", exact: true }).click();

  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  await page.getByLabel("Name").fill("Second Workspace");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  await expect(page.getByText("Browser Project Updated")).not.toBeVisible();

  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: /E2E Workspace/ }).click();
  await expect(page.getByRole("heading", { name: "Browser Project Updated", level: 3 })).toBeVisible();
  await page.getByRole("heading", { name: "Browser Project Updated", level: 3 }).click();
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByLabel("Project status").selectOption("archived");
  await expect(page.getByRole("heading", { name: "Browser Project Updated", level: 3 })).toBeVisible();
  await page.getByRole("heading", { name: "Browser Project Updated", level: 3 }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByLabel("Project status")).toHaveValue("active");
  await expect(page.getByRole("heading", { name: "Browser Project Updated", level: 3 })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

