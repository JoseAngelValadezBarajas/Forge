import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { copyGuideAssets, guideAssetManifest, shouldPromoteGuideAssets, validateGuideAssetManifest } from "./user-guide-assets.mjs";

const validPng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082",
  "hex",
);

test("user-guide asset manifest covers every required real product surface", () => {
  const required = [
    "workspace-home",
    "workspace-create",
    "project-overview",
    "project-board",
    "feature-detail",
    "decisions-readiness",
    "context-packages",
    "workbench-handoffs",
    "evidence-release-candidates",
  ];
  assert.deepEqual(guideAssetManifest.map((asset) => asset.id), required);
  assert.doesNotThrow(() => validateGuideAssetManifest(guideAssetManifest));
});

test("user-guide asset manifest accepts only repository-owned PNG names", () => {
  assert.throws(
    () => validateGuideAssetManifest([{ id: "bad", source: "../../private.png", target: "bad.png" }]),
    /relative PNG path/,
  );
  assert.throws(
    () => validateGuideAssetManifest([{ id: "bad", source: "candidate.png", target: "bad.jpg" }]),
    /relative PNG path/,
  );
  assert.throws(
    () => validateGuideAssetManifest([{ id: "duplicate", source: "a.png", target: "same.png" }, { id: "duplicate", source: "b.png", target: "same.png" }]),
    /unique IDs and targets/,
  );
});

test("user-guide asset copying rejects corrupt screenshots before promotion", async () => {
  const root = await mkdtemp(join(tmpdir(), "forge-user-guide-assets-"));
  const candidateDirectory = join(root, "candidate");
  const outputDirectory = join(root, "output");
  const workspaceCreatePath = join(outputDirectory, "workspace-create.png");
  await Promise.all([mkdir(candidateDirectory), mkdir(outputDirectory)]);
  await writeFile(workspaceCreatePath, validPng);
  await Promise.all(
    guideAssetManifest
      .filter((asset) => asset.id !== "workspace-create")
      .map((asset) => writeFile(join(candidateDirectory, asset.source), validPng)),
  );
  await writeFile(join(candidateDirectory, "dark-home.png"), "not a PNG");

  assert.throws(
    () => copyGuideAssets({ candidateDirectory, workspaceCreatePath, outputDirectory }),
    /valid PNG screenshot/,
  );
});

test("user-guide capture promotes assets only after every source fixture passes", () => {
  assert.equal(shouldPromoteGuideAssets(0, 0), true);
  assert.equal(shouldPromoteGuideAssets(1, 0), false);
  assert.equal(shouldPromoteGuideAssets(0, 1), false);
});
