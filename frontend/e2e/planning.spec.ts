import { expect, test } from "@playwright/test";

test("completes the planning workflow in Chromium", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const expectedCycleErrors: string[] = [];
  let expectingCycleRejection = false;
  page.on("console", (message) => {
    if (message.type() === "error") {
      if (expectingCycleRejection && message.text().includes("422")) expectedCycleErrors.push(message.text());
      else consoleErrors.push(message.text());
    }
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
  await page.getByRole("button", { name: "+ Epic", exact: true }).click();
  await page.getByLabel("Title").fill("Release planning");
  await page.getByLabel("Description").fill("Plan the first local delivery");
  await page.getByRole("button", { name: "Create epic", exact: true }).click();

  await page.getByRole("link", { name: "Features", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Features & Epics", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit epic", exact: true }).click();
  await page.getByRole("heading", { name: "Edit epic", exact: true }).waitFor();
  await page.getByLabel("Title").fill("Release planning edited");
  await page.getByLabel("Description").fill("Edited planning context");
  await page.getByLabel("Status").selectOption("archived");
  await page.getByRole("button", { name: "Save epic", exact: true }).click();
  await expect(page.getByRole("link", { name: "Release planning edited", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "+ Feature", exact: true }).click();
  await page.getByLabel("Title").fill("Persistent planning slice");
  await page.getByLabel("Goal").fill("Keep product intent durable");
  await page.getByLabel("Epic").selectOption({ label: "Release planning edited" });
  await page.getByRole("button", { name: "Create feature", exact: true }).click();
  await expect(page.getByRole("heading", { name: /FEAT-001.*Persistent planning slice/, level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("button", { name: "+ Feature", exact: true }).click();
  await page.getByLabel("Title").fill("Dependent feature");
  await page.getByRole("button", { name: "Create feature", exact: true }).click();
  await expect(page.getByRole("heading", { name: /FEAT-002.*Dependent feature/, level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("link", { name: /Persistent planning slice/ }).click();
  await expect(page.getByRole("heading", { name: "Edit feature", exact: true })).toBeVisible();
  await page.getByLabel("Feature title").fill("Persistent planning slice edited");
  await page.getByLabel("Feature description").fill("A durable planning description");
  await page.getByLabel("Feature goal").fill("Keep product intent durable and editable");
  await page.getByLabel("Feature priority").selectOption("critical");
  await page.getByLabel("Feature state").selectOption("ready");
  await page.getByLabel("Feature epic").selectOption({ label: "Release planning edited" });
  await page.getByRole("button", { name: "Save feature", exact: true }).click();
  await expect(page.getByRole("heading", { name: /FEAT-001.*Persistent planning slice edited/, level: 1 })).toBeVisible();
  await page.getByLabel("Feature epic").selectOption("");
  await page.getByRole("button", { name: "Save feature", exact: true }).click();
  await expect(page.getByLabel("Feature epic")).toHaveValue("");

  for (const title of ["Task one", "Task two", "Task three"]) {
    await page.getByLabel("New task").fill(title);
    const taskCreated = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/tasks"),
    );
    await page.locator("form.inline-add").first().getByRole("button", { name: "Add", exact: true }).click();
    expect((await taskCreated).status()).toBe(201);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Edit task Task one", exact: true }).click();
  await page.getByLabel("Task title for Task one").fill("Task one edited");
  await page.getByLabel("Task description for Task one").fill("Task implementation detail");
  await page.getByLabel("Task state for Task one").selectOption("in_progress");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Task one edited", { exact: true })).toBeVisible();
  const taskReordered = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/tasks/reorder"),
  );
  await page.getByRole("button", { name: /Move task Task two down/ }).click();
  expect((await taskReordered).status()).toBe(200);
  await expect(page.getByLabel("New acceptance criterion")).toBeEnabled();

  for (const description of ["Criterion one", "Criterion two", "Criterion three"]) {
    await page.getByLabel("New acceptance criterion").fill(description);
    await page.getByLabel("New acceptance criterion").press("Enter");
    await expect(page.getByText(description, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Edit criterion Criterion one", exact: true }).click();
  await page.getByLabel("Criterion description for Criterion one").fill("Criterion one edited");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Criterion one edited", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Mark satisfied: Criterion one edited/ }).click();
  await expect(page.getByText("Manual declaration only; not verification evidence.", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Move criterion Criterion two down/ }).click();

  await page.getByLabel("Dependency relationship").selectOption("blocks");
  const dependentFeatureOption = await page.getByLabel("Dependency feature").locator("option").nth(1).getAttribute("value");
  await page.getByLabel("Dependency feature").selectOption(dependentFeatureOption!);
  await page.getByRole("button", { name: "Add dependency", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Blocks", exact: true })).toBeVisible();
  await expect(page.locator(".dependency-group").nth(1).getByText(/FEAT-002.*Dependent feature/)).toBeVisible();
  await expect(page.getByText("No features block this feature.", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("link", { name: /Dependent feature/ }).click();
  await expect(page.getByRole("heading", { name: "Blocked by", exact: true })).toBeVisible();
  await expect(page.locator(".dependency-group").first().getByText(/FEAT-001.*Persistent planning slice edited/)).toBeVisible();
  await expect(page.getByText("This feature blocks nothing yet.", { exact: true })).toBeVisible();
  await page.getByLabel("Dependency relationship").selectOption("blocks");
  const editedFeatureOption = await page.getByLabel("Dependency feature").locator("option").nth(1).getAttribute("value");
  await page.getByLabel("Dependency feature").selectOption(editedFeatureOption!);
  expectingCycleRejection = true;
  await page.getByRole("button", { name: "Add dependency", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cycle");
  expect(expectedCycleErrors).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".dependency-group").first().getByText(/FEAT-001.*Persistent planning slice edited/)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
