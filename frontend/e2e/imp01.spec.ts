import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const examplePath = resolve("..", "docs", "product", "examples", "forge-project-import-v1.valid.json");

test("IMP-01 imports a reviewed planning document, exports it, and preserves archived reads", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const workspacesResponse = await page.request.get("/api/workspaces");
  expect(workspacesResponse.ok()).toBeTruthy();
  const workspaces = (await workspacesResponse.json()) as Array<{ id: string; name: string }>;
  const workspace = workspaces[0];
  expect(workspace?.id).toBeTruthy();
  await page.addInitScript((workspaceId) => {
    window.localStorage.setItem("forge-active-workspace", workspaceId);
  }, workspace.id);

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import project" }).click();
  await page.locator('input[type="file"]').setInputFiles(examplePath);
  await expect(page.getByText(/Selected: forge-project-import-v1\.valid\.json/)).toBeVisible();
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("status")).toContainText("Preview validated");
  await expect(page.getByText(/Fingerprint:/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("project-import-preview.png"), fullPage: true });

  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Forge planning example", exact: true })).toBeVisible();

  const exportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project" }).click();
  const exported = await exportDownload;
  expect(exported.suggestedFilename()).toContain("forge-project-");
  const exportedPath = await exported.path();
  expect(exportedPath).toBeTruthy();
  const exportedDocument = JSON.parse(readFileSync(exportedPath!, "utf8")) as { schema_version: string; project: { name: string } };
  expect(exportedDocument.schema_version).toBe("forge-project-import-v1");
  expect(exportedDocument.project.name).toBe("Forge planning example");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("status")).toContainText("Project archived");
  const archivedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project" }).click();
  await expect((await archivedDownload).path()).resolves.toBeTruthy();

  const secondWorkspaceResponse = await page.request.post("/api/workspaces", {
    data: { name: "IMP-01 round-trip workspace" },
  });
  expect(secondWorkspaceResponse.status()).toBe(201);
  const secondWorkspace = (await secondWorkspaceResponse.json()) as { id: string; name: string };
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page.reload();
  await page.locator("button.workspace-switcher").click();
  await page.getByRole("menuitem", { name: secondWorkspace.name, exact: true }).click();
  await expect(page.locator("button.workspace-switcher")).toContainText(secondWorkspace.name);
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "Import project" }).click();
  await page.locator('input[type="file"]').setInputFiles(exportedPath!);
  const secondPreviewResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/workspaces/${secondWorkspace.id}/projects/import/preview`) &&
    response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("status")).toContainText("Preview validated");
  const secondPreview = await secondPreviewResponse;
  expect(secondPreview.status()).toBe(200);
  const secondPreviewBody = (await secondPreview.json()) as {
    document: Record<string, unknown>;
    fingerprint: string;
  };
  const secondImport = await page.request.post(
    `/api/workspaces/${secondWorkspace.id}/projects/import`,
    { data: { document: secondPreviewBody.document, expected_fingerprint: secondPreviewBody.fingerprint } },
  );
  expect(secondImport.status()).toBe(201);
  const secondImportBody = (await secondImport.json()) as { project_id: string };
  const secondProjectResponse = await page.request.get(
    `/api/workspaces/${secondWorkspace.id}/projects/${secondImportBody.project_id}`,
  );
  expect(secondProjectResponse.status()).toBe(200);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("button", { name: /Forge planning example/ })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
