import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";

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

export function shouldPromoteGuideAssets(visualStatus, workspaceStatus) {
  return visualStatus === 0 && workspaceStatus === 0;
}

export function validateGuideAssetManifest(manifest) {
  const ids = new Set();
  const targets = new Set();
  for (const asset of manifest) {
    if (typeof asset.id !== "string" || ids.has(asset.id) || targets.has(asset.target)) {
      throw new Error("Guide asset manifest requires unique IDs and targets.");
    }
    ids.add(asset.id);
    targets.add(asset.target);
    for (const path of [asset.source, asset.target]) {
      if (
        typeof path !== "string" ||
        isAbsolute(path) ||
        path.includes("..") ||
        basename(path) !== path ||
        extname(path).toLowerCase() !== ".png"
      ) {
        throw new Error("Guide asset manifest requires a relative PNG path.");
      }
    }
  }
}

const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");

function assertRegularPng(path) {
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Guide screenshot must be a regular PNG file.");
  const header = readFileSync(path).subarray(0, 24);
  if (header.length < 24 || !header.subarray(0, 8).equals(pngSignature) || header.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error("Guide screenshot must be a valid PNG screenshot.");
  }
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error("Guide screenshot must be a valid PNG screenshot.");
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
    assertRegularPng(source);
    copyFileSync(source, target);
  }
}
