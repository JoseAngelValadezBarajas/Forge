import { expect, test } from "@playwright/test";

test("Command Palette keyboard focus is named, contained, and restored on mobile", async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Search or command" });
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  const input = page.getByRole("combobox", { name: "Search commands" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-controls", "command-options");

  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("option").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewport.width);
});
