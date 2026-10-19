import { expect, test } from "@playwright/test";

test("navigates planning hierarchy and uses explicit board status selection", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString();
  const workspaces = await (await page.request.get("/api/workspaces")).json();
  const workspace = workspaces[0] as { id: string };
  const projectResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/projects`,
    { data: { name: `UX-01A ${suffix}`, description: "Navigation acceptance fixture" } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const base = `/api/workspaces/${workspace.id}/projects/${project.id}`;
  const epicResponse = await page.request.post(`${base}/epics`, {
    data: { title: `Product clarity ${suffix}`, description: "Parent planning intent" },
  });
  expect(epicResponse.status()).toBe(201);
  const epic = await epicResponse.json();
  const featureResponse = await page.request.post(`${base}/features`, {
    data: {
      title: `Navigation clarity ${suffix}`,
      goal: "Make planning context discoverable",
      priority: "high",
      epic_id: epic.id,
    },
  });
  expect(featureResponse.status()).toBe(201);
  const feature = await featureResponse.json();
  const doneResponse = await page.request.post(`${base}/features`, {
    data: {
      title: `Completed planning ${suffix}`,
      goal: "Keep a completed card visible for filtering",
      priority: "low",
      status: "done",
    },
  });
  expect(doneResponse.status()).toBe(201);

  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { level: 1, name: `UX-01A ${suffix}`, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por dónde continuar", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/ux01a-project-home.png", fullPage: true });

  await page.getByRole("link", { name: "Explore Epics", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/epics$`));
  await page.locator(`a[href="/projects/${project.id}/epics/${epic.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/epics/${epic.id}$`));
  await expect(page.getByRole("heading", { name: "Features in this Epic", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`${feature.key}.*Navigation clarity`), exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/ux01a-epic-detail.png", fullPage: true });
  await page.getByRole("link", { name: new RegExp(`${feature.key}.*Navigation clarity`), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/features/${feature.id}$`));
  await expect(page.getByRole("heading", { name: "Edit feature", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/ux01a-feature-detail.png", fullPage: true });

  await page.goto(`/projects/${project.id}/features`);
  await expect(page.getByRole("heading", { name: "Features & Epics", exact: true })).toBeVisible();
  await page.getByLabel("Search features").fill(feature.key);
  await page.getByLabel("Feature workflow").selectOption("backlog");
  await page.getByLabel("Feature priority").selectOption("high");
  await page.getByLabel("Feature grouping").selectOption({ label: `Product clarity ${suffix}` });
  await expect(page.getByText(new RegExp(`Navigation clarity ${suffix}`), { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(`Completed planning ${suffix}`), { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/ux01a-feature-explorer-filtered.png", fullPage: true });
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(page.getByLabel("Feature workflow")).toHaveValue("");
  await expect(page.getByLabel("Feature priority")).toHaveValue("");
  await expect(page.getByLabel("Feature grouping")).toHaveValue("");

  await page.goto(`/projects/${project.id}/board`);
  const status = page.getByRole("combobox", { name: `Status for ${feature.key}` });
  await expect(status).toHaveValue("backlog");
  const update = page.waitForResponse((response) =>
    response.request().method() === "PATCH" && response.url().endsWith(`/features/${feature.id}`),
  );
  await status.selectOption("done");
  expect((await update).status()).toBe(200);
  await expect(status).toHaveValue("done");
  await page.screenshot({ path: "test-results/ux01a-board-after-status.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/ux01a-mobile-board.png", fullPage: true });
  await expect(page.locator("body")).toBeVisible();
});
