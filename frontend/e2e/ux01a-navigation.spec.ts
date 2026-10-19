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

test("keeps archived planning surfaces readable without exposing write actions", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString();
  const workspaces = await (await page.request.get("/api/workspaces")).json();
  const workspace = workspaces[0] as { id: string };
  const projectResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/projects`,
    { data: { name: `UX-01A archived ${suffix}`, description: "Read-only planning fixture" } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const base = `/api/workspaces/${workspace.id}/projects/${project.id}`;
  const epicResponse = await page.request.post(`${base}/epics`, {
    data: { title: `Archived Epic ${suffix}`, description: "Historical planning intent" },
  });
  expect(epicResponse.status()).toBe(201);
  const epic = await epicResponse.json();
  const featureResponse = await page.request.post(`${base}/features`, {
    data: {
      title: `Archived Feature ${suffix}`,
      goal: "Keep archived planning readable",
      priority: "medium",
      epic_id: epic.id,
    },
  });
  expect(featureResponse.status()).toBe(201);
  const feature = await featureResponse.json();
  expect((await page.request.post(`${base}/archive`)).status()).toBe(200);

  const writes: string[] = [];
  page.on("request", (request) => {
    const method = request.method();
    if (
      request.url().includes(base) &&
      method !== "GET" &&
      method !== "HEAD"
    ) {
      writes.push(`${method} ${request.url()}`);
    }
  });

  await page.goto(`/projects/${project.id}/features?create=1`);
  await expect(page.getByRole("heading", { name: "Features & Epics", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/archived project.*read-only/i);
  await expect(page.getByRole("button", { name: "+ Epic", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "+ Feature", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: /Status for/ }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit epic", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Create feature", exact: true })).toHaveCount(0);

  await page.goto(`/projects/${project.id}/board?create=epic`);
  await expect(page.getByRole("heading", { name: "Project Board", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Epic", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "+ Feature", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Create epic", exact: true })).toHaveCount(0);

  await page.goto(`/projects/${project.id}/epics/${epic.id}`);
  await expect(page.getByRole("heading", { name: "Features in this Epic", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`${feature.key}.*Archived Feature`) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit epic", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "+ Create feature", exact: true })).toHaveCount(0);

  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { level: 1, name: `UX-01A archived ${suffix}`, exact: true })).toBeVisible();
  await expect(page.locator(".project-planning-home").getByRole("note")).toContainText(/archived project.*read-only/i);
  await expect(page.getByRole("link", { name: "Explore Epics", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open board", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /create feature/i })).toHaveCount(0);
  expect(writes).toEqual([]);
});
