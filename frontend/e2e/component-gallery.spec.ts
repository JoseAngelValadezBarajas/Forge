import { expect, test } from "@playwright/test";

test("certifies the shared component gallery in dark/light desktop and mobile", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/__component-gallery");
  await expect(page.getByRole("heading", { name: "Component Gallery" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Form primitives" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
  await expect(page.locator(".status-chip.neutral")).toContainText("Unknown status");
  await page.screenshot({ path: testInfo.outputPath("component-gallery-dark.png"), fullPage: true, animations: "disabled", caret: "hide", scale: "css" });

  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: testInfo.outputPath("component-gallery-light.png"), fullPage: true, animations: "disabled", caret: "hide", scale: "css" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: testInfo.outputPath("component-gallery-mobile-dark.png"), fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
  const overflow = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(overflow.scrollWidth, `gallery document overflowed at ${overflow.clientWidth}px`).toBeLessThanOrEqual(overflow.clientWidth);
  expect(consoleErrors).toEqual([]);
});
