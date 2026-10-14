import { expect, test } from "@playwright/test";

test("records a run and publishes an explicit handoff against real SQLite", async ({ page }) => {
  const workspacesResponse = await page.request.get("/api/workspaces");
  expect(workspacesResponse.ok()).toBeTruthy();
  const [workspace] = await workspacesResponse.json();
  expect(workspace?.id).toBeTruthy();

  const projectResponse = await page.request.post(`/api/workspaces/${workspace.id}/projects`, {
    data: { name: `FND-05 E2E ${Date.now()}`, description: "Temporary acceptance project" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();

  const featureResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/projects/${project.id}/features`,
    { data: { title: "Record a real work session", goal: "Preserve reported context" } },
  );
  expect(featureResponse.status()).toBe(201);
  const feature = await featureResponse.json();

  const packageResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/projects/${project.id}/features/${feature.id}/context/packages`,
  );
  expect(packageResponse.status()).toBe(201);
  const contextPackage = await packageResponse.json();
  expect(contextPackage.id).toBeTruthy();

  await page.goto("/workbench");
  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();
  await expect(page.getByText("NO RUNS RECORDED YET")).toBeVisible();
  await page.screenshot({ path: "test-results/fnd05-workbench-empty.png", fullPage: true });

  await page.goto("/workbench/runs");
  await expect(page.getByRole("heading", { name: "Agent Runs" })).toBeVisible();
  await page.screenshot({ path: "test-results/fnd05-runs-inventory.png", fullPage: true });
  await page.goto(`/workbench/runs/new?project=${project.id}&feature=${feature.id}`);
  await expect(page.getByRole("heading", { name: "Record a New Run" })).toBeVisible();
  await page.getByRole("textbox", { name: "Run title" }).fill("Browser-reported planning run");
  await page.getByRole("textbox", { name: "Executor label" }).fill("Chromium acceptance");
  await page.getByRole("button", { name: /Record run/ }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/runs/`));
  const runId = new URL(page.url()).pathname.split("/").pop();
  expect(runId).toBeTruthy();
  const run = { id: runId as string };
  await page.screenshot({ path: "test-results/fnd05-run-create.png", fullPage: true });

  await page.goto(`/projects/${project.id}/runs/${run.id}`);
  await expect(page.getByRole("heading", { name: "Run Detail & Timeline" })).toBeVisible();
  await page.getByRole("button", { name: "+ Add event" }).click();
  await page.getByRole("textbox", { name: "Event title" }).fill("Browser progress");
  await page.getByRole("textbox", { name: "Event description" }).fill("The real browser recorded this progress event.");
  await page.getByRole("button", { name: "Report event" }).click();
  await expect(page.getByText("Browser progress")).toBeVisible();
  await expect(page.getByText("2 events")).toBeVisible();
  await page.getByRole("button", { name: "+ Add output" }).click();
  await page.getByRole("textbox", { name: "Output label" }).fill("Reported artifact");
  await page.getByRole("textbox", { name: "Output summary" }).fill("A declared result from the recorded work.");
  await page.getByRole("textbox", { name: "Output provenance" }).fill("Manual report from Chromium.");
  await page.getByRole("button", { name: "Report output" }).click();
  await expect(page.getByText("Reported artifact")).toBeVisible();
  await page.getByRole("button", { name: "Move to IN PROGRESS" }).click();
  await expect(page.locator(".fnd05-status.in_progress")).toBeVisible();

  await page.getByRole("button", { name: "Prepare handoff" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/handoffs/`));
  await expect(page.getByRole("heading", { name: "Handoff Review & Acknowledge" })).toBeVisible();
  await page.getByRole("textbox", { name: "summary" }).fill("A human-readable report from Chromium.");
  await page.getByRole("textbox", { name: "outcomes" }).fill("Run record and timeline were persisted.");
  await page.getByRole("textbox", { name: "blockers" }).fill("No delivery verification was performed.");
  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByText("READY", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A human-readable report from Chromium." })).toBeVisible();
  await page.screenshot({ path: "test-results/fnd05-handoff-ready.png", fullPage: true });

  const handoffUrl = page.url();
  await page.goto("/workbench/handoffs");
  await expect(page.getByRole("heading", { name: "Handoff Queue" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Next step for Browser-reported planning run/ })).toBeVisible();
  await page.screenshot({ path: "test-results/fnd05-handoff-queue.png", fullPage: true });
  await page.getByRole("link", { name: /Next step for Browser-reported planning run/ }).click();
  await expect(page).toHaveURL(handoffUrl);
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("ACKNOWLEDGED", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/fnd05-handoff-acknowledged.png", fullPage: true });

  await page.reload();
  await expect(page.getByText("ACKNOWLEDGED", { exact: true })).toBeVisible();
  await expect(page.getByText(contextPackage.fingerprint.slice(0, 16))).toBeVisible();

  const storedRunResponse = await page.request.get(
    `/api/workspaces/${workspace.id}/projects/${project.id}/runs/${run.id}`,
  );
  expect(storedRunResponse.ok()).toBeTruthy();
  const storedRun = await storedRunResponse.json();
  expect(storedRun.context_package_id).toBe(contextPackage.id);
  expect(storedRun.context_fingerprint).toBe(contextPackage.fingerprint);

  await page.setViewportSize({ width: 390, height: 852 });
  await page.screenshot({ path: "test-results/fnd05-mobile-handoff.png", fullPage: true });
});
