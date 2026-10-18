import { Buffer } from "node:buffer";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateUserGuideMarkdown } from "./build-user-guide.mjs";

/* global console */

const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const guideDirectory = resolve(frontendRoot, "..", "docs", "user-guide");
const [markdown, html, pdf, assetNames] = await Promise.all([
  readFile(join(guideDirectory, "README.es.md"), "utf8"),
  readFile(join(guideDirectory, "Forge-User-Guide.es.html"), "utf8"),
  readFile(join(guideDirectory, "generated", "Forge-User-Guide.es.pdf")),
  readdir(join(guideDirectory, "assets")),
]);
const assets = new Set(assetNames.filter((name) => extname(name) === ".png").map((name) => `assets/${name}`));
validateUserGuideMarkdown(markdown, assets);
if (!html.includes('aria-label="Contenido"') || !html.includes('class="manual-cover"')) {
  throw new Error("HTML export is missing the manual cover or linked table of contents.");
}
if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || pdf.length < 100_000) {
  throw new Error("PDF export is missing or unexpectedly small.");
}
console.log(`Validated user guide: ${assets.size} screenshots, HTML table of contents, and ${pdf.length} PDF bytes.`);
