import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const expectedOutput = resolve(repositoryRoot, "docs", "user-guide", "assets", "workspace-create.png");

test("captures the documented workspace creation screen from the real application", async ({ page }) => {
  test.skip(process.env.FORGE_USER_GUIDE_CAPTURE !== "1", "runs only through the documentation capture command");
  const requestedOutput = resolve(process.env.FORGE_USER_GUIDE_WORKSPACE_CREATE ?? "");
  expect(requestedOutput).toBe(expectedOutput);
  await page.goto("/");
  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create", exact: true })).toBeVisible();
  await page.screenshot({ path: requestedOutput, fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
});
