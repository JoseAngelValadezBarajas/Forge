import { expect, test } from "@playwright/test";

test("keeps archived projects readable, rejects new planning records, and leaves rejected repository paths unrecorded", async ({ page }) => {
  const [workspace] = await (await page.request.get("/api/workspaces")).json();
  const projectResponse = await page.request.post(`/api/workspaces/${workspace.id}/projects`, {
    data: { name: "QA-01 boundaries", description: "Isolated acceptance fixture" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const base = `/api/workspaces/${workspace.id}/projects/${project.id}`;

  const rejected = await page.request.post(`${base}/repositories`, {
    data: { root_path: process.cwd() },
  });
  expect(rejected.status()).toBe(422);
  expect(await (await page.request.get(`${base}/repositories`)).json()).toEqual([]);

  expect((await page.request.post(`${base}/archive`)).status()).toBe(200);
  const readable = await page.request.get(base);
  expect(readable.ok()).toBeTruthy();
  expect((await readable.json()).status).toBe("archived");

  const rejectedFeature = await page.request.post(`${base}/features`, {
    data: { title: "Must not be created", goal: "Archived projects are read-only" },
  });
  expect(rejectedFeature.status()).toBe(422);
  expect(await (await page.request.get(`${base}/features`)).json()).toEqual([]);

  expect((await page.request.post(`${base}/restore`)).status()).toBe(200);
  const restoredFeature = await page.request.post(`${base}/features`, {
    data: { title: "Allowed after restore", goal: "Project lifecycle is reversible" },
  });
  expect(restoredFeature.status()).toBe(201);
});

test("filters planning inventory with real empty and matching states", async ({ page }) => {
  const [workspace] = await (await page.request.get("/api/workspaces")).json();
  const projectResponse = await page.request.post(`/api/workspaces/${workspace.id}/projects`, {
    data: { name: "QA-01 filters", description: "Isolated planning filters fixture" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const base = `/api/workspaces/${workspace.id}/projects/${project.id}`;

  for (const payload of [
    { title: "Critical release path", goal: "Visible only for critical release search", priority: "critical" },
    { title: "Routine notes", goal: "A normal planning item", priority: "low" },
  ]) {
    expect((await page.request.post(`${base}/features`, { data: payload })).status()).toBe(201);
  }

  await page.goto(`/projects/${project.id}/features`);
  await expect(page.getByRole("heading", { name: "Features & Epics" })).toBeVisible();
  await page.getByLabel("Search features").fill("release");
  await page.getByLabel("Feature priority").selectOption("critical");
  await expect(page.getByText("Critical release path", { exact: true })).toBeVisible();
  await expect(page.getByText("Routine notes", { exact: true })).toHaveCount(0);

  await page.getByLabel("Search features").fill("does not exist");
  await expect(page.getByText("No features exist yet. Create the first planning record.")).toBeVisible();
  await page.getByLabel("Search features").fill("");
  await expect(page.getByText("Critical release path", { exact: true })).toBeVisible();
});
