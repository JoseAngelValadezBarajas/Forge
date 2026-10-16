import { readFileSync } from "node:fs";
import { Console } from "node:console";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logger = new Console({ stdout: process.stdout, stderr: process.stderr });
const summaryPath = resolve(frontendRoot, "coverage/coverage-summary.json");
const coverage = JSON.parse(readFileSync(summaryPath, "utf8"));
const metricNames = ["statements", "branches", "functions", "lines"];

function addSummary(target, item) {
  for (const metric of metricNames) {
    target[metric].total += item[metric].total;
    target[metric].covered += item[metric].covered;
  }
}

function emptySummary() {
  return Object.fromEntries(metricNames.map((metric) => [metric, { total: 0, covered: 0 }]));
}

function percentage(metric) {
  return metric.total === 0 ? null : (metric.covered / metric.total) * 100;
}

function show(label, summary) {
  const values = metricNames.map((metric) => {
    const value = summary[metric];
    return `${metric} ${percentage(value)?.toFixed(1) ?? "n/a"}% (${value.covered}/${value.total})`;
  });
  logger.log(`${label}: ${values.join(" | ")}`);
}

const api = emptySummary();
const domains = new Map();
const features = new Map();
for (const [filePath, fileSummary] of Object.entries(coverage)) {
  if (filePath === "total") continue;
  const normalized = filePath.replaceAll("\\", "/");
  const domain = normalized.match(/\/src\/features\/([^/]+)\/api\//)?.[1];
  const feature = normalized.match(/\/src\/features\/([^/]+)\//)?.[1];
  const sharedApi = normalized.includes("/src/shared/api/");
  const legacyApi = normalized.endsWith("/src/api.ts");
  if (feature) {
    if (!features.has(feature)) features.set(feature, emptySummary());
    addSummary(features.get(feature), fileSummary);
  }
  if (domain) {
    if (!domains.has(domain)) domains.set(domain, emptySummary());
    addSummary(domains.get(domain), fileSummary);
    addSummary(api, fileSummary);
  } else if (sharedApi || legacyApi) {
    addSummary(api, fileSummary);
  }
}

show("Frontend", coverage.total);
show("API client and transport", api);
for (const [feature, summary] of [...features].sort(([left], [right]) => left.localeCompare(right))) {
  show(`Feature ${feature} (API + UI)`, summary);
}
if (domains.size === 0) {
logger.log("Domain API modules: not yet extracted (baseline client is src/api.ts).");
} else {
  for (const [domain, summary] of [...domains].sort(([left], [right]) => left.localeCompare(right))) {
    show(`Domain ${domain}`, summary);
  }
}

if (process.argv.includes("--report-only")) process.exit(0);

const apiLineCoverage = percentage(api.lines);
const apiBranchCoverage = percentage(api.branches);
if (apiLineCoverage === null || apiBranchCoverage === null) {
  logger.error("API coverage could not be measured; refusing to report a passing threshold.");
  process.exit(1);
}
if (apiLineCoverage < 95 || apiBranchCoverage < 90) {
  logger.error("API coverage is below the target of 95% lines and 90% branches.");
  process.exit(1);
}
