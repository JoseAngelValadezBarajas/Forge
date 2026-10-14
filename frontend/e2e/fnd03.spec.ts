import { expect, test } from "@playwright/test";

test("completes the decisions, invariants and readiness workflow in Chromium", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on("console", (entry) => {
    if (entry.type() === "error") consoleErrors.push(entry.text());
  });
  const suffix = Date.now().toString();

  await page.goto("/");
  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: "Create workspace", exact: true }).click();
  await page.getByLabel("Name").fill(`FND03 Workspace ${suffix}`);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByLabel("Project name").fill(`Readiness Project ${suffix}`);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.getByRole("link", { name: /Open board/ }).click();
  await page.getByRole("button", { name: "+ Feature", exact: true }).click();
  await page.getByLabel("Title").fill("Planning readiness feature");
  await page.getByLabel("Goal").fill("Make readiness explainable before implementation");
  await page.getByRole("button", { name: "Create feature", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Planning readiness feature/, level: 1 })).toBeVisible();
  const featureUrl = page.url();
  const projectUrl = featureUrl.split("/features/")[0];
  await expect(page.getByText("NOT READY", { exact: true })).toBeVisible();
  await expect(page.getByText(/Add clear acceptance criteria/)).toBeVisible();

  await page.getByLabel("New acceptance criterion").fill("The readiness result explains every rule");
  await page.locator("form.inline-add").nth(1).getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("The readiness result explains every rule", { exact: true })).toBeVisible();

  await page.goto(projectUrl);
  await page.getByRole("link", { name: "Decisions", exact: true }).first().click();
  await page.getByRole("button", { name: "+ New decision", exact: true }).click();
  await page.getByLabel("Title").fill("Use local planning rules");
  await page.getByLabel("Decision context").fill("Readiness must be reproducible without providers");
  await page.getByLabel("Decision", { exact: true }).fill("Use explicit versioned rules");
  await page.getByLabel("Decision rationale").fill("The result must be explainable to the team");
  await page.locator("form.fnd-form").getByRole("button", { name: "Create decision", exact: true }).click();
  await expect(page.getByText("Use local planning rules", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept decision", exact: true }).click();
  await expect(page.getByText("accepted", { exact: true })).toBeVisible();

  await page.goto(projectUrl);
  await page.getByRole("link", { name: "Invariants", exact: true }).first().click();
  await page.getByRole("button", { name: "+ New invariant", exact: true }).click();
  await page.getByLabel("Title").fill("Planning is not verification");
  await page.getByLabel("Statement").fill("Readiness does not assert technical compliance");
  await page.getByLabel("Rationale").fill("Reported, observed and verified remain distinct");
  await page.locator("form.fnd-form").getByRole("button", { name: "Create invariant", exact: true }).click();
  await expect(page.getByText("Planning is not verification", { exact: true })).toBeVisible();

  await page.goto(featureUrl);
  await expect(page.getByRole("heading", { name: "Readiness", exact: true })).toBeVisible();
  await page.getByLabel("Decision to link").selectOption({ label: "Use local planning rules" });
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page.getByRole("button", { name: "Acknowledge review", exact: true }).click();
  await expect(page.getByText("READY TO START", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Evaluate & save", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);

  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.getByRole("link", { name: "Invariants", exact: true }).first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Rationale").fill("The distinction must survive every planning revision");
  await page.getByRole("button", { name: "Save invariant", exact: true }).click();

  await page.goto(featureUrl);
  await expect(page.getByText("STALE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Evaluate & save", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".history-row")).toHaveCount(2);
  expect(consoleErrors).toEqual([]);
});
