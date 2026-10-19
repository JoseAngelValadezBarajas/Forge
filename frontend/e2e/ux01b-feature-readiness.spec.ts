import { expect, test } from "@playwright/test";

test("guides a feature from NOT READY to READY and keeps the saved snapshot honest", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString();
  const workspaces = await (await page.request.get("/api/workspaces")).json();
  const workspace = workspaces[0] as { id: string };
  const projectResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/projects`,
    { data: { name: `UX-01B ${suffix}`, description: "Feature readiness journey" } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const base = `/api/workspaces/${workspace.id}/projects/${project.id}`;
  const blockerResponse = await page.request.post(`${base}/features`, {
    data: {
      title: `Blocking feature ${suffix}`,
      goal: "Provide the prerequisite planning context",
      priority: "medium",
    },
  });
  expect(blockerResponse.status()).toBe(201);
  const blocker = await blockerResponse.json();
  const featureResponse = await page.request.post(`${base}/features`, {
    data: {
      title: `Ready feature ${suffix}`,
      priority: "high",
    },
  });
  expect(featureResponse.status()).toBe(201);
  const feature = await featureResponse.json();
  const dependencyResponse = await page.request.post(`${base}/dependencies`, {
    data: { blocking_feature_id: blocker.id, blocked_feature_id: feature.id },
  });
  expect(dependencyResponse.status()).toBe(201);

  const featureUrl = `/projects/${project.id}/features/${feature.id}`;
  await page.goto(featureUrl);
  await expect(page.getByRole("heading", { name: "Readiness", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Planning readiness", exact: true }).getByText("NOT READY", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Feature detail sections" })).toBeVisible();
  await expect(page.getByText(/Describe the functional goal/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit definition" })).toHaveAttribute("href", "#feature-definition");
  await page.screenshot({ path: testInfo.outputPath("ux01b-not-ready.png"), fullPage: true });

  await page.getByLabel("Feature goal").fill("Start only after the prerequisite is complete");
  await page.getByRole("button", { name: "Save feature", exact: true }).click();
  await expect(page.getByText(/Add at least one acceptance criterion/)).toBeVisible();
  await page.getByLabel("New acceptance criterion").fill("The feature is ready to start when planning is complete");
  await page.getByRole("button", { name: "Add", exact: true }).last().click();
  await expect(page.getByText("The feature is ready to start when planning is complete", { exact: true })).toBeVisible();
  await expect(page.getByText(/PASS.*R02/)).toBeVisible();
  await expect(page.getByText(/must be DONE before this feature can start/)).toBeVisible();

  await page.goto(`/projects/${project.id}/features/${blocker.id}`);
  await page.getByLabel("Feature state").selectOption("done");
  await page.getByRole("button", { name: "Save feature", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save feature", exact: true })).toBeVisible();

  await page.goto(featureUrl);
  await expect(page.getByRole("region", { name: "Planning readiness", exact: true }).getByText("READY TO START", { exact: true })).toBeVisible();
  await expect(page.getByText(/6 \/ 6 rules passed/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ux01b-ready.png"), fullPage: true });
  await page.getByRole("button", { name: "Evaluate & save", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(page.getByText("SAVED SNAPSHOT", { exact: true })).toBeVisible();

  await page.getByLabel("New acceptance criterion").fill("A second planning note is retained");
  await page.getByRole("button", { name: "Add", exact: true }).last().click();
  await expect(page.getByText("A second planning note is retained", { exact: true })).toBeVisible();
  await expect(page.getByText("STALE", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ux01b-stale.png"), fullPage: true });

  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(base) && !["GET", "HEAD"].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });
  expect((await page.request.post(`${base}/archive`)).status()).toBe(200);
  await page.goto(featureUrl);
  await expect(page.getByText(/Archived project.*read-only/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Feature definition", exact: true })).toBeVisible();
  await expect(page.getByText("SAVED SNAPSHOT", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Evaluate & save", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("New task")).toHaveCount(0);
  await expect(page.getByLabel("New acceptance criterion")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("ux01b-archived.png"), fullPage: true });
  expect(
    writes.filter(
      (entry) => !entry.includes("/archive") && !entry.includes("/readiness/preview"),
    ),
  ).toEqual([]);
});
