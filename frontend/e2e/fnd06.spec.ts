import { expect, test } from "@playwright/test";

test("FND-06 evidence, deterministic verification and immutable release candidate", async ({ page }, testInfo) => {
  const workspacesResponse = await page.request.get("/api/workspaces");
  expect(workspacesResponse.ok()).toBeTruthy();
  const [workspace] = await workspacesResponse.json();
  const projectResponse = await page.request.post(`/api/workspaces/${workspace.id}/projects`, {
    data: { name: `FND-06 delivery ${Date.now()}`, description: "Isolated acceptance project" },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  const featureResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/projects/${project.id}/features`,
    { data: { title: "Evidence-backed planning", goal: "Preserve verifiable delivery context" } },
  );
  expect(featureResponse.status()).toBe(201);
  const feature = await featureResponse.json();
  const criterionResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/projects/${project.id}/features/${feature.id}/acceptance-criteria`,
    { data: { description: "A criterion with explicitly linked evidence" } },
  );
  expect(criterionResponse.status()).toBe(201);
  const criterion = await criterionResponse.json();
  const packageResponse = await page.request.post(
    `/api/workspaces/${workspace.id}/projects/${project.id}/features/${feature.id}/context/packages`,
  );
  expect(packageResponse.status()).toBe(201);
  const context = await packageResponse.json();
  const base = `/api/workspaces/${workspace.id}/projects/${project.id}`;
  const evidenceResponse = await page.request.post(`${base}/evidence`, {
    data: {
      feature_id: feature.id,
      acceptance_criterion_id: criterion.id,
      evidence_type: "reported_test_result",
      title: "User-reported test summary",
      description: "Declared test summary; not fetched or independently checked.",
      source_kind: "safe_link",
      source_reference: "https://example.test/report/42",
      declared_outcome: "PASS",
    },
  });
  expect(evidenceResponse.status()).toBe(201);
  const evidence = await evidenceResponse.json();
  expect(evidence.provenance).toBe("REPORTED");

  const emptyProjectResponse = await page.request.post(`/api/workspaces/${workspace.id}/projects`, {
    data: { name: `FND-06 empty ${Date.now()}`, description: "Empty evidence state" },
  });
  const emptyProject = await emptyProjectResponse.json();
  await page.goto(`/projects/${emptyProject.id}/delivery`);
  await expect(page.getByText("No evidence recorded yet")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("empty-evidence.png"), fullPage: true });
  await page.getByRole("link", { name: "Register evidence" }).click();
  await expect(page.getByRole("heading", { name: "Register evidence" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("register-evidence.png"), fullPage: true });

  await page.goto(`/projects/${project.id}/delivery`);
  await expect(page.getByRole("heading", { name: "Delivery" })).toBeVisible();
  await expect(page.getByText("Loading delivery records")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Trust levels" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("delivery-overview.png"), fullPage: true });
  await expect(page.getByText("No evidence recorded yet")).toHaveCount(0);
  await page.getByRole("link", { name: "Evidence", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Evidence inventory" })).toBeVisible();
  await expect(page.getByRole("link", { name: /User-reported test summary/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("evidence-inventory.png"), fullPage: true });
  await page.getByRole("textbox", { name: "Search evidence" }).fill("not in this inventory");
  await expect(page.getByRole("heading", { name: "No matching evidence" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search evidence" }).fill("User-reported test summary");
  await expect(page.getByRole("link", { name: /User-reported test summary/ })).toBeVisible();
  await page.getByRole("link", { name: /User-reported test summary/ }).click();
  await expect(page.getByText("REPORTED", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("evidence-detail.png"), fullPage: true });

  const verify = await page.request.post(`${base}/verifications/evaluate`, {
    data: { rule_id: "V02", context_package_id: context.id },
  });
  expect(verify.status()).toBe(201);
  const evaluation = await verify.json();
  expect(evaluation.result).toBe("PASS");
  const negative = await page.request.post(`${base}/verifications/preview`, {
    data: { rule_id: "V02", context_package_id: context.id, expected_digest: "0".repeat(64) },
  });
  expect((await negative.json()).result).toBe("FAIL");
  await page.goto(`/projects/${project.id}/delivery/verifications`);
  await expect(page.getByRole("heading", { name: "Verification center" })).toBeVisible();
  await expect(page.locator(".fnd06-list .status-chip.pass").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("verification-center.png"), fullPage: true });
  await expect(page.locator(".fnd06-list .status-chip.pass").first()).toBeVisible();
  await page.goto(`/projects/${project.id}/delivery/verifications/new`);
  await expect(page.getByRole("heading", { name: "Verification center" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Evaluate & Save" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("verification-config.png"), fullPage: true });
  await page.goto(`/projects/${project.id}/delivery/verifications`);
  await expect(page.locator(".fnd06-list .status-chip.pass").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("verification-result.png"), fullPage: true });

  const candidateResponse = await page.request.post(`${base}/release-candidates`, {
    data: {
      title: "Browser acceptance candidate",
      intended_version: "0.6.0-local",
      feature_ids: [feature.id],
      context_package_ids: [context.id],
      evidence_ids: [evidence.id],
      verification_ids: [],
    },
  });
  expect(candidateResponse.status()).toBe(201);
  const candidate = await candidateResponse.json();
  await page.goto(`/projects/${project.id}/delivery/release-candidates/${candidate.id}`);
  await expect(page.getByRole("heading", { name: "Release candidate" })).toBeVisible();
  await page.getByRole("textbox", { name: "Candidate title" }).fill("Browser acceptance candidate revised");
  await page.getByRole("button", { name: "Save draft changes" }).click();
  await expect(page.getByRole("heading", { name: "Browser acceptance candidate revised" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("candidate-draft.png"), fullPage: true });
  await page.getByRole("button", { name: "Freeze candidate snapshot" }).click();
  await expect(page.getByRole("button", { name: "Evaluate release gates" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("candidate-frozen.png"), fullPage: true });
  await page.getByRole("button", { name: "Evaluate release gates" }).click();
  await expect(page.getByRole("heading", { name: "Release gate evaluation" })).toBeVisible();
  await expect(page.locator(".fnd06-check-list .status-chip.blocked").first()).toBeVisible();
  await expect(
    page.getByText(/Required V02 verification is missing or not current for input/),
  ).toBeVisible();
  await expect(
    page.getByText(/Required V04 verification is missing or not current for input/),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("release-gates.png"), fullPage: true });
  await page.getByRole("button", { name: "Generate & save manifest" }).click();
  await expect(page.getByText("NOT PUBLISHED", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("manifest.png"), fullPage: true });
  const manifest = await page.request.get(`${base}/release-candidates/${candidate.id}/manifest`);
  expect(manifest.ok()).toBeTruthy();
  const payload = await manifest.json();
  expect(payload.payload.publication_status).toBe("NOT_PUBLISHED");
  expect(payload.payload.scope.feature_ids).toEqual([feature.id]);
  const markdown = await page.request.get(
    `${base}/release-candidates/${candidate.id}/manifest/download?format=markdown`,
  );
  expect(markdown.ok()).toBeTruthy();
  expect(await markdown.text()).toContain("forge-release-manifest-v1");
  await page.reload();
  await expect(page.getByText("NOT PUBLISHED", { exact: true })).toBeVisible();

  const invalidated = await page.request.post(`${base}/evidence/${evidence.id}/invalidate`);
  expect(invalidated.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator(".status-chip.stale").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("stale-gate.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("mobile-gates.png"), fullPage: true });
  const overflow = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("body *"))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.right > window.innerWidth + 1)
    .slice(-8)
    .map(({ element, rect }) => ({ tag: element.tagName, className: String(element.className), text: element.textContent?.slice(0, 50), right: rect.right, width: element.scrollWidth })));
  expect(overflow).toEqual([]);
});
