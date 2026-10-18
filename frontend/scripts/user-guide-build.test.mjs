import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  renderUserGuideHtml,
  requiredGuideSections,
  validateUserGuideMarkdown,
} from "./build-user-guide.mjs";
import { validateUserGuideHtml } from "./user-guide-output-validation.mjs";

test("user guide validation requires every promised Spanish manual section and real guide assets", () => {
  const markdown = requiredGuideSections.map((heading) => `## ${heading}`).join("\n\n");
  assert.doesNotThrow(() => validateUserGuideMarkdown(markdown, new Set(["assets/workspace-home.png"])));
  assert.throws(
    () => validateUserGuideMarkdown("## Qué es Forge", new Set()),
    /Instalación de Forge Desktop en Windows/,
  );
  assert.throws(
    () => validateUserGuideMarkdown(`${markdown}\n\n![No existe](assets/missing.png)`, new Set()),
    /missing guide asset/,
  );
});

test("HTML export has a cover, linked table of contents, page number footer and manual content", () => {
  const markdown = ["# Manual de Forge", "## Qué es Forge", "Texto de prueba.", "![Inicio](assets/workspace-home.png)"].join("\n\n");
  const html = renderUserGuideHtml(markdown, { version: "Alpha", generatedAt: "2026-10-18" });
  assert.match(html, /class="manual-cover"/);
  assert.match(html, /href="#que-es-forge"/);
  assert.match(html, /class="page-footer"/);
  assert.match(html, /assets\/workspace-home\.png/);
});

test("HTML export escapes raw HTML from manual content and headings", () => {
  const html = renderUserGuideHtml(
    ["# Manual de Forge", "## <script>alert(1)</script> Contexto", "<script>alert(2)</script>"].join("\n\n"),
    { version: "Alpha", generatedAt: "2026-10-18" },
  );
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; Contexto/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
});

test("print stylesheet leaves page numbering to the PDF footer instead of duplicating document text", async () => {
  const css = await readFile(resolve(import.meta.dirname, "../../docs/user-guide/user-guide.css"), "utf8");
  assert.doesNotMatch(css, /\.page-footer\s*\{\s*display:\s*block/s);
});

test("HTML validation rejects broken image and table-of-contents references", () => {
  assert.throws(
    () => validateUserGuideHtml('<img src="assets/missing.png"><a href="#missing">Missing</a>', new Set()),
    /missing guide asset/,
  );
  assert.doesNotThrow(() => validateUserGuideHtml('<h2 id="known">Known</h2><a href="#known">Known</a>', new Set()));
});
