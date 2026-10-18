import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";

export const guideAssetManifest = [
  { id: "workspace-home", source: "dark-home.png", target: "workspace-home.png" },
  { id: "workspace-create", source: "workspace-create.png", target: "workspace-create.png" },
  { id: "project-overview", source: "dark-project-overview.png", target: "project-overview.png" },
  { id: "project-board", source: "dark-board.png", target: "project-board.png" },
  { id: "feature-detail", source: "dark-feature-detail.png", target: "feature-detail.png" },
  { id: "decisions-readiness", source: "dark-decisions.png", target: "decisions-readiness.png" },
  { id: "context-packages", source: "dark-context-package.png", target: "context-packages.png" },
  { id: "workbench-handoffs", source: "dark-handoff-detail.png", target: "workbench-handoffs.png" },
  { id: "evidence-release-candidates", source: "dark-release-candidate.png", target: "evidence-release-candidates.png" },
];

export function validateGuideAssetManifest(manifest) {
  for (const asset of manifest) {
    for (const path of [asset.source, asset.target]) {
      if (
        typeof path !== "string" ||
        isAbsolute(path) ||
        path.includes("..") ||
        extname(path).toLowerCase() !== ".png"
      ) {
        throw new Error("Guide asset manifest requires a relative PNG path.");
      }
    }
  }
}

function inside(parent, candidate) {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return Boolean(relativePath) && !isAbsolute(relativePath) && !relativePath.startsWith("..");
}

export function copyGuideAssets({ candidateDirectory, workspaceCreatePath, outputDirectory }) {
  validateGuideAssetManifest(guideAssetManifest);
  if (!inside(outputDirectory, workspaceCreatePath)) throw new Error("Workspace capture must stay in the guide asset directory.");
  mkdirSync(outputDirectory, { recursive: true });
  for (const asset of guideAssetManifest) {
    const source = asset.id === "workspace-create" ? workspaceCreatePath : resolve(candidateDirectory, asset.source);
    const target = resolve(outputDirectory, asset.target);
    if (!inside(outputDirectory, target) || !existsSync(source)) {
      throw new Error(`Missing guide screenshot for ${asset.id}.`);
    }
    copyFileSync(source, target);
  }
}
