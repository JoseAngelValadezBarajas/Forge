import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Marked } from "marked";
import { chromium } from "playwright";

/* global console */

const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = resolve(frontendRoot, "..");
const guideDirectory = resolve(repositoryRoot, "docs", "user-guide");
const sourcePath = join(guideDirectory, "README.es.md");
const stylePath = join(guideDirectory, "user-guide.css");
const htmlPath = join(guideDirectory, "Forge-User-Guide.es.html");
const outputDirectory = join(guideDirectory, "generated");
const pdfPath = join(outputDirectory, "Forge-User-Guide.es.pdf");

export const requiredGuideSections = [
  "Qué es Forge",
  "Instalación de Forge Desktop en Windows",
  "Primer inicio y recorrido de la interfaz",
  "Workspaces",
  "Projects",
  "Epics, Features y Tasks",
  "Project Board y transiciones de estado",
  "Acceptance Criteria y dependencias",
  "Decisions e Invariants",
  "Readiness",
  "Conexiones de repositorios Git",
  "Context Packages",
  "Workbench: Runs y Handoffs",
  "Evidence y Verifications",
  "Release Candidates y gates",
  "Búsqueda, atajos y temas visuales",
  "Exports",
  "Datos locales, respaldos y recuperación",
  "Solución de problemas",
  "Glosario y limitaciones conocidas",
];

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function imagePaths(markdown) {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1].split(" ")[0]);
}

export function validateUserGuideMarkdown(markdown, assets) {
  for (const heading of requiredGuideSections) {
    if (!markdown.includes(`## ${heading}`)) throw new Error(`Missing required section: ${heading}`);
  }
  for (const image of imagePaths(markdown)) {
    if (!image.startsWith("assets/") || !assets.has(image)) throw new Error(`missing guide asset: ${image}`);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function headingText(tokens) {
  return tokens
    .map((token) => {
      if (Array.isArray(token.tokens)) return headingText(token.tokens);
      return token.text ?? "";
    })
    .join("");
}

export function renderUserGuideHtml(markdown, { version, generatedAt, css = "" }) {
  const headings = [];
  const usedIds = new Map();
  const renderer = {
    html({ text }) {
      return escapeHtml(text);
    },
    heading({ tokens, depth }) {
      const text = headingText(tokens);
      const baseId = slug(text);
      const index = usedIds.get(baseId) ?? 0;
      usedIds.set(baseId, index + 1);
      const id = index ? `${baseId}-${index + 1}` : baseId;
      if (depth === 2) headings.push({ id, text });
      return `<h${depth} id="${id}">${escapeHtml(text)}</h${depth}>\n`;
    },
  };
  const parser = new Marked({ gfm: true, renderer });
  const content = parser.parse(markdown);
  const toc = headings.map(({ id, text }) => `<li><a href="#${id}">${escapeHtml(text)}</a></li>`).join("\n");
  return `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Manual de Forge — ${version}</title><style>${css}</style></head>
<body><main class="manual">
<section class="manual-cover"><p class="eyebrow">FORGE · DESKTOP ALPHA</p><h1>Manual de usuario</h1><p class="cover-version">${version}</p><p>Guía práctica para planear, registrar contexto y revisar evidencia localmente.</p><p class="cover-date">Actualizado: ${generatedAt}</p></section>
<nav class="manual-toc" aria-label="Contenido"><h2>Contenido</h2><ol>${toc}</ol></nav>
<article class="manual-content">${content}</article>
</main><footer class="page-footer">Forge Desktop Alpha · Guía de usuario</footer></body></html>`;
}

async function assetSet() {
  const names = await readdir(join(guideDirectory, "assets"));
  return new Set(names.filter((name) => extname(name).toLowerCase() === ".png").map((name) => `assets/${name}`));
}

async function validateLinks(markdown) {
  const links = [...markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    const target = resolve(guideDirectory, link.split("#")[0]);
    if (!relative(repositoryRoot, target) || relative(repositoryRoot, target).startsWith("..")) {
      throw new Error(`Guide link leaves the repository: ${link}`);
    }
    await stat(target);
  }
}

export async function buildUserGuide() {
  const [markdown, css, assets] = await Promise.all([readFile(sourcePath, "utf8"), readFile(stylePath, "utf8"), assetSet()]);
  validateUserGuideMarkdown(markdown, assets);
  await validateLinks(markdown);
  const html = renderUserGuideHtml(markdown, { version: "Desktop Alpha 0.1", generatedAt: "2026-10-18", css });
  await writeFile(htmlPath, html, "utf8");
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: '<div style="width:100%;font-size:8px;color:#555;text-align:center">Forge Desktop Alpha · Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
      margin: { top: "18mm", right: "15mm", bottom: "18mm", left: "15mm" },
    });
  } finally {
    await browser.close();
  }
  return { htmlPath, pdfPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = await buildUserGuide();
  console.log(`HTML: ${built.htmlPath}`);
  console.log(`PDF: ${built.pdfPath}`);
}
