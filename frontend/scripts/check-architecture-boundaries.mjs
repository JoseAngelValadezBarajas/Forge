import ts from "typescript";
import { Console } from "node:console";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process, { stderr, stdout } from "node:process";

const reporter = new Console({ stdout, stderr });

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const ignoredTestPath = /(?:^|\/)(?:test|tests|e2e)(?:\/|$)|\.(?:test|spec)\.(?:ts|tsx|mts|cts)$/;

const normalize = (value) => value.split(path.sep).join("/");

function collectSourceFiles(sourceRoot) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const absolute = path.join(directory, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else if (sourceExtensions.has(path.extname(entry))) files.push(absolute);
    }
  };
  visit(sourceRoot);
  return files;
}

function resolveSourceFile(sourceRoot, importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    ...[...sourceExtensions].map((extension) => `${base}${extension}`),
    ...[".ts", ".tsx", ".mts", ".cts"].map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => candidate.startsWith(`${sourceRoot}${path.sep}`) && sourceExtensions.has(path.extname(candidate)) && statSyncSafe(candidate)) ?? null;
}

function statSyncSafe(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function moduleEdges(sourceFile) {
  const edges = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const allNamedImportsAreTypes = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((item) => item.isTypeOnly);
      const runtime = !clause?.isTypeOnly && !(allNamedImportsAreTypes && !clause.name);
      edges.push({ specifier: node.moduleSpecifier.text, runtime });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({ specifier: node.moduleSpecifier.text, runtime: !node.isTypeOnly });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      edges.push({ specifier: node.arguments[0].text, runtime: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return edges;
}

function owner(relativePath) {
  const parts = relativePath.split("/");
  if (parts[0] === "features" && parts[1]) return { kind: "feature", name: parts[1], parts };
  if (parts[0] === "shared") return { kind: "shared", name: null, parts };
  if (parts[0] === "app") return { kind: "app", name: null, parts };
  return { kind: "root", name: null, parts };
}

function isPublicFeatureInterface(relativePath, featureName) {
  return relativePath === `features/${featureName}/index.ts` || relativePath === `features/${featureName}/index.tsx`;
}

export function checkArchitecture(sourceRoot) {
  const absoluteRoot = path.resolve(sourceRoot);
  const files = collectSourceFiles(absoluteRoot).filter((file) => !ignoredTestPath.test(normalize(path.relative(absoluteRoot, file))));
  const fileSet = new Set(files);
  const issues = [];
  const graph = new Map(files.map((file) => [file, []]));
  const addIssue = (message) => issues.push(message);

  for (const file of files) {
    const relative = normalize(path.relative(absoluteRoot, file));
    const source = readFileSync(file, "utf8");
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const currentOwner = owner(relative);

    if ((currentOwner.kind === "root" && /^fnd\d+\.tsx?$/i.test(relative)) || relative === "planning.tsx") {
      addIssue(`milestone-module: obsolete root production module ${relative}`);
    }

    if (relative !== "shared/api/client.ts") {
      let hasFetchCall = false;
      const inspectFetch = (node) => {
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          if (ts.isIdentifier(expression) && expression.text === "fetch") hasFetchCall = true;
          if (
            ts.isPropertyAccessExpression(expression) &&
            expression.name.text === "fetch" &&
            ts.isIdentifier(expression.expression) &&
            ["window", "globalThis"].includes(expression.expression.text)
          ) {
            hasFetchCall = true;
          }
        }
        ts.forEachChild(node, inspectFetch);
      };
      inspectFetch(parsed);
      if (hasFetchCall) addIssue(`duplicate-transport: ${relative} calls fetch outside shared/api/client.ts`);
    }

    for (const edge of moduleEdges(parsed)) {
      const isFeatureApi = currentOwner.kind === "feature" && currentOwner.parts.includes("api");
      const isReactPackage = /^(?:react|react-dom)(?:\/|$)/.test(edge.specifier);
      if (isFeatureApi && edge.runtime && isReactPackage) {
        addIssue(`api-ui-import: ${relative} imports UI dependency ${edge.specifier}`);
      }

      const target = resolveSourceFile(absoluteRoot, file, edge.specifier);
      if (!target || !fileSet.has(target)) continue;
      const targetRelative = normalize(path.relative(absoluteRoot, target));
      const targetOwner = owner(targetRelative);

      if (currentOwner.kind === "shared" && (targetOwner.kind === "app" || targetOwner.kind === "feature")) {
        addIssue(`shared-boundary: ${relative} imports ${targetRelative}`);
      }
      if (currentOwner.kind === "feature" && targetOwner.kind === "app") {
        addIssue(`feature-to-app: ${relative} imports ${targetRelative}`);
      }
      if (currentOwner.kind === "app" && targetOwner.kind === "feature" && !isPublicFeatureInterface(targetRelative, targetOwner.name)) {
        addIssue(`private-feature-import: ${relative} imports ${targetRelative}; use features/${targetOwner.name}/index`);
      }
      if (currentOwner.kind === "feature" && targetOwner.kind === "feature" && currentOwner.name !== targetOwner.name &&
          !isPublicFeatureInterface(targetRelative, targetOwner.name)) {
        addIssue(`private-feature-import: ${relative} imports ${targetRelative}; use features/${targetOwner.name}/index`);
      }

      if (isFeatureApi) {
        const isUiFile =
          (targetOwner.kind === "feature" && targetOwner.name === currentOwner.name &&
            /(?:^|\/)(?:pages|components|hooks)(?:\/|$)/.test(targetRelative)) ||
          (targetOwner.kind === "shared" && /(?:^|\/)ui(?:\/|$)/.test(targetRelative));
        if (isUiFile) addIssue(`api-ui-import: ${relative} imports UI dependency ${edge.specifier}`);
      }

      if (edge.runtime) graph.get(file).push(target);
    }

    if (relative === "api.ts") {
      for (const edge of moduleEdges(parsed)) {
        if (!edge.specifier.startsWith("./features/")) continue;
        if (!/^\.\/features\/[^/]+\/api(?:\/(?:index|contracts))?$/.test(edge.specifier)) {
          addIssue(`api-facade-boundary: src/api.ts imports non-API feature path ${edge.specifier}`);
        }
      }
    }
  }

  const visiting = [];
  const active = new Set();
  const visited = new Set();
  const reportedCycles = new Set();
  const visit = (file) => {
    if (active.has(file)) {
      const start = visiting.indexOf(file);
      const cycleFiles = [...visiting.slice(start), file];
      const cycle = cycleFiles.map((item) => normalize(path.relative(absoluteRoot, item))).join(" -> ");
      if (!reportedCycles.has(cycle)) {
        reportedCycles.add(cycle);
        addIssue(`runtime-cycle: ${cycle}`);
      }
      return;
    }
    if (visited.has(file)) return;
    active.add(file);
    visiting.push(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
    visiting.pop();
    active.delete(file);
    visited.add(file);
  };
  for (const file of files) visit(file);

  return [...new Set(issues)].sort();
}

const rootArgument = process.argv.indexOf("--root");
if (rootArgument >= 0 && !process.argv[rootArgument + 1]) {
  reporter.error("Expected a source directory after --root.");
  process.exit(2);
}
const sourceRoot = rootArgument >= 0 ? process.argv[rootArgument + 1] : path.resolve(process.cwd(), "src");
const issues = checkArchitecture(sourceRoot);
if (issues.length) {
  for (const issue of issues) reporter.error(`ERROR ${issue}`);
  process.exit(1);
}
const absoluteSourceRoot = path.resolve(sourceRoot);
const allFiles = collectSourceFiles(absoluteSourceRoot);
const productionFiles = allFiles.filter(
  (file) =>
    !ignoredTestPath.test(
      normalize(path.relative(absoluteSourceRoot, file)),
    ),
);
reporter.log(
  `Architecture boundaries pass (${productionFiles.length} production TypeScript files inspected; ${allFiles.length - productionFiles.length} test files excluded).`,
);
