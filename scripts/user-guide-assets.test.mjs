import assert from "node:assert/strict";
import test from "node:test";

import { guideAssetManifest, validateGuideAssetManifest } from "./user-guide-assets.mjs";

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
});
