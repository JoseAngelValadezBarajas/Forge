import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { Console } from "node:console";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URLSearchParams } from "node:url";
import ts from "typescript";
import {
  checkSuccessResponses,
  compareRequestTypes,
  matchOpenApiRoute,
  normalizeOpenApiSchema,
  normalizeTypeScriptExpression,
  normalizeTypeScriptNode,
} from "./api-contract-verifier.mjs";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(frontendRoot, "..");
const backendRoot = path.join(repositoryRoot, "backend");
const logger = new Console({ stdout: process.stdout, stderr: process.stderr });
const baselinePath = path.join(frontendRoot, "tests/fixtures/rfx02d-api-response-baseline.json");
const baselineSnapshot = JSON.parse(readFileSync(baselinePath, "utf8"));
const correctionsPath = path.join(frontendRoot, "tests/fixtures/rfx-org-03a-contract-corrections.json");
const corrections = JSON.parse(readFileSync(correctionsPath, "utf8"));

function generateCurrentOpenApi() {
  const isolatedDirectory = mkdtempSync(path.join(os.tmpdir(), "forge-openapi-contract-"));
  const isolatedDatabase = path.join(isolatedDirectory, "openapi.db").replaceAll("\\", "/");
  const python = "import json; from app.main import app; print(json.dumps(app.openapi(), separators=(',', ':')))";
  try {
    const result = spawnSync(
      process.platform === "win32" ? "uv.exe" : "uv",
      ["run", "--locked", "--project", backendRoot, "python", "-c", python],
      {
        cwd: backendRoot,
        encoding: "utf8",
        env: { ...process.env, FORGE_DATABASE_URL: `sqlite:///${isolatedDatabase}`, FORGE_ENVIRONMENT: "test" },
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    if (result.error) throw new Error(`Could not start isolated OpenAPI generation: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error(`Isolated OpenAPI generation failed (${result.status}): ${result.stderr.trim()}`);
    }
    try {
      return JSON.parse(result.stdout.trim());
    } catch (error) {
      throw new Error(`Isolated OpenAPI generation returned invalid JSON: ${String(error)}`, { cause: error });
    }
  } finally {
    rmSync(isolatedDirectory, { recursive: true, force: true });
  }
}

function sourceFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(filename));
    else if (filename.endsWith(".ts") && !filename.endsWith(".d.ts")) result.push(filename);
  }
  return result;
}

const configPath = path.join(frontendRoot, "tsconfig.app.json");
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
if (configRead.error) throw new Error(ts.flattenDiagnosticMessageText(configRead.error.messageText, "\n"));
const parsedConfig = ts.parseJsonConfigFileContent(configRead.config, ts.sys, frontendRoot, undefined, configPath);
const program = ts.createProgram({ rootNames: parsedConfig.fileNames, options: parsedConfig.options });
const checker = program.getTypeChecker();
const openApi = generateCurrentOpenApi();

function identifierPropertyName(property) {
  return property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name))
    ? property.name.text
    : undefined;
}

function apiObject(sourceFile, variableName) {
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((item) => ts.isIdentifier(item.name) && item.name.text === variableName);
  return declaration?.initializer && ts.isObjectLiteralExpression(declaration.initializer)
    ? declaration.initializer
    : undefined;
}

function findRequestCall(node) {
  let found;
  function visit(current) {
    if (found) return;
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === "request") {
      found = current;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function routePattern(argument) {
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) return argument.text.split("?")[0];
  if (!ts.isTemplateExpression(argument)) throw new Error(`Unsupported API route expression: ${argument.getText()}`);
  let pattern = argument.head.text;
  for (const span of argument.templateSpans) {
    if (span.expression.getText() !== "suffix") pattern += `{${span.expression.getText()}}`;
    pattern += span.literal.text;
  }
  return pattern.split("?")[0];
}

function requestBodyNode(call) {
  const options = call.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) return undefined;
  const body = options.properties.find((item) => identifierPropertyName(item) === "body");
  if (!body || !ts.isPropertyAssignment(body) || !ts.isCallExpression(body.initializer)) return undefined;
  const serializer = body.initializer;
  if (!ts.isPropertyAccessExpression(serializer.expression) || serializer.expression.name.text !== "stringify") return undefined;
  return serializer.arguments[0];
}

function literalArgument(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}

function queryTypeNodes(methodNode) {
  const result = new Map();
  function add(name, value) {
    if (name && value) result.set(name, value);
  }
  function visit(node) {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URLSearchParams") {
      const input = node.arguments?.[0];
      if (input && ts.isObjectLiteralExpression(input)) {
        for (const item of input.properties) {
          if (ts.isPropertyAssignment(item)) add(identifierPropertyName(item), item.initializer);
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const name = literalArgument(node.arguments[0]);
      if ((method === "set" || method === "append") && name && node.arguments[1]) add(name, node.arguments[1]);
    }
    ts.forEachChild(node, visit);
  }
  visit(methodNode);
  return result;
}

function apiMethods(sourceFile, objectName) {
  const object = apiObject(sourceFile, objectName);
  if (!object) return new Map();
  const result = new Map();
  for (const property of object.properties) {
    const name = identifierPropertyName(property);
    if (!name) continue;
    const call = findRequestCall(property);
    if (!call?.typeArguments?.[0] || !call.arguments[0]) throw new Error(`Missing typed request call for ${name}`);
    const options = call.arguments[1] && ts.isObjectLiteralExpression(call.arguments[1]) ? call.arguments[1] : undefined;
    const methodProperty = options?.properties.find((item) => identifierPropertyName(item) === "method");
    const method = methodProperty && ts.isPropertyAssignment(methodProperty) && ts.isStringLiteral(methodProperty.initializer)
      ? methodProperty.initializer.text.toLowerCase()
      : "get";
    result.set(name, {
      path: `/api${routePattern(call.arguments[0])}`,
      method,
      responseTypeNode: call.typeArguments[0],
      bodyTypeNode: requestBodyNode(call),
      queryTypeNodes: queryTypeNodes(property),
    });
  }
  return result;
}

function findFeatureApiFiles() {
  return sourceFiles(path.join(frontendRoot, "src/features"))
    .filter((filename) => path.basename(filename) === "index.ts" && path.basename(path.dirname(filename)) === "api");
}

const currentMethods = new Map();
for (const filename of findFeatureApiFiles()) {
  const sourceFile = program.getSourceFile(filename);
  if (!sourceFile) throw new Error(`TypeScript program did not load ${filename}`);
  const apiVariable = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((item) => ts.isIdentifier(item.name) && item.name.text.endsWith("Api"));
  if (!apiVariable || !ts.isIdentifier(apiVariable.name)) throw new Error(`Missing API object in ${filename}`);
  for (const [name, operation] of apiMethods(sourceFile, apiVariable.name.text)) {
    if (currentMethods.has(name)) throw new Error(`Duplicate frontend API operation ${name}`);
    currentMethods.set(name, operation);
  }
}

function objectProperty(object, name) {
  return object.properties.find((property) => identifierPropertyName(property) === name);
}

function literalString(property) {
  return property && ts.isPropertyAssignment(property) ? literalArgument(property.initializer) : undefined;
}

function serializedBodyFields(property) {
  if (!property || !ts.isPropertyAssignment(property) || !ts.isCallExpression(property.initializer)) return undefined;
  const call = property.initializer;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "jsonBody" || !call.arguments[0] || !ts.isObjectLiteralExpression(call.arguments[0])) return undefined;
  const fields = [];
  for (const member of call.arguments[0].properties) {
    if (!ts.isPropertyAssignment(member)) throw new Error(`Unsupported body fixture expression: ${member.getText()}`);
    if (member.initializer.getText() !== "undefined") fields.push(identifierPropertyName(member));
  }
  return fields;
}

function readRequestContractCases() {
  const sourceDirectory = path.join(frontendRoot, "src");
  const result = [];
  for (const filename of readdirSync(sourceDirectory).filter((name) => /^api\..*\.test\.ts$/.test(name))) {
    const filePath = path.join(sourceDirectory, filename);
    const source = program.getSourceFile(filePath) ?? ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "characterizeApiContracts") {
        const cases = node.arguments[1];
        if (!cases || !ts.isArrayLiteralExpression(cases)) throw new Error(`Missing contract case array in ${filename}`);
        for (const item of cases.elements) {
          if (!ts.isObjectLiteralExpression(item)) throw new Error(`Unsupported API case fixture in ${filename}`);
          const name = literalString(objectProperty(item, "name"));
          const url = literalString(objectProperty(item, "url"));
          const method = literalString(objectProperty(item, "method"))?.toLowerCase() ?? "get";
          const bodyFields = serializedBodyFields(objectProperty(item, "body"));
          if (!name || !url) throw new Error(`API case is missing a static name or URL in ${filename}`);
          result.push({ name: name.split(" ")[0], url, method, bodyFields, file: filename });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return result;
}

function pathMatchesOperation(concretePath, pathPattern) {
  const concrete = concretePath.split("/");
  const expected = pathPattern.split("/");
  return concrete.length === expected.length && expected.every((segment, index) =>
    /^\{[^{}]+\}$/.test(segment) || segment === concrete[index],
  );
}

function requestContractFailures(cases) {
  const failures = [];
  const seenNames = new Set();
  for (const contract of cases) {
    const current = currentMethods.get(contract.name);
    if (!current) {
      failures.push(`${contract.name}: characterized request has no frontend API method`);
      continue;
    }
    seenNames.add(contract.name);
    const [pathPattern, query = ""] = contract.url.split("?", 2);
    if (contract.method !== current.method) failures.push(`${contract.name}: fixture method ${contract.method} differs from API method ${current.method}`);
    if (!pathMatchesOperation(pathPattern, current.path)) failures.push(`${contract.name}: fixture path ${pathPattern} does not match API path ${current.path}`);

    const route = matchOpenApiRoute(current.path, current.method, openApi.paths);
    const operation = route?.[1][current.method];
    if (!operation) {
      failures.push(`${contract.name}: no ${current.method.toUpperCase()} ${current.path} in current backend OpenAPI`);
      continue;
    }
    const parameters = (operation.parameters ?? []).filter((parameter) => parameter.in === "query");
    const parametersByName = new Map(parameters.map((parameter) => [parameter.name, parameter]));
    const fixtureQueryNames = new Set([...new URLSearchParams(query).keys()]);
    for (const name of fixtureQueryNames) {
      if (!parametersByName.has(name)) failures.push(`${contract.name}: query parameter ${name} is absent from backend OpenAPI`);
    }
    for (const parameter of parameters) {
      const valueNode = current.queryTypeNodes.get(parameter.name);
      if (parameter.required && !valueNode) failures.push(`${contract.name}: required query parameter ${parameter.name} is not supplied by the frontend API`);
      if (valueNode) {
        try {
          const frontend = normalizeTypeScriptExpression(valueNode, checker);
          const backend = normalizeOpenApiSchema(parameter.schema, openApi.components?.schemas ?? {});
          const diffs = compareRequestTypes(frontend, backend);
          for (const diff of diffs) failures.push(`${contract.name}: query ${parameter.name} ${diff}`);
        } catch (error) {
          failures.push(`${contract.name}: query ${parameter.name} could not be verified: ${String(error)}`);
        }
      }
    }

    if (current.bodyTypeNode) {
      try {
        const schema = operation.requestBody?.content?.["application/json"]?.schema;
        if (!schema) {
          failures.push(`${contract.name}: frontend serializes a JSON body but backend OpenAPI has none`);
        } else {
          const frontend = normalizeTypeScriptExpression(current.bodyTypeNode, checker);
          const backend = normalizeOpenApiSchema(schema, openApi.components?.schemas ?? {});
          for (const diff of compareRequestTypes(frontend, backend)) failures.push(`${contract.name}: request body ${diff}`);
          const required = new Set(backendRequiredFields(schema, openApi.components?.schemas ?? {}));
          for (const field of required) {
            if (contract.bodyFields && !contract.bodyFields.includes(field)) failures.push(`${contract.name}: required request field ${field} is absent from its characterization fixture`);
          }
          for (const field of contract.bodyFields ?? []) {
            if (!Object.hasOwn(backend.properties ?? {}, field) && backend.additionalProperties?.kind !== "unknown") {
              failures.push(`${contract.name}: fixture request field ${field} is absent from backend OpenAPI`);
            }
          }
        }
      } catch (error) {
        failures.push(`${contract.name}: request body schema could not be verified: ${String(error)}`);
      }
    } else if (contract.bodyFields?.length) {
      failures.push(`${contract.name}: characterization sends a body but the API method does not serialize one`);
    }
  }
  if (seenNames.size !== 94 || currentMethods.size !== 94) {
    failures.push(`operation count mismatch: characterized=${seenNames.size}, frontend=${currentMethods.size}, expected=94`);
  }
  for (const name of currentMethods.keys()) if (!seenNames.has(name)) failures.push(`${name}: no request characterization fixture`);
  return failures;
}

function backendRequiredFields(schema, components, visited = new Set()) {
  if (schema?.$ref) {
    const name = schema.$ref.split("/").at(-1);
    if (!name || visited.has(name) || !components[name]) return [];
    return backendRequiredFields(components[name], components, new Set([...visited, name]));
  }
  return [...new Set([...(schema?.required ?? []), ...(schema?.allOf ?? []).flatMap((item) => backendRequiredFields(item, components, new Set(visited)))])];
}

function historicalShape(type) {
  if (type.kind === "array") return { isArray: true, item: historicalShape(type.items) };
  if (type.kind === "object") {
    return {
      isArray: false,
      properties: Object.entries(type.properties).map(([name, property]) => [name, property.optional]).sort(([left], [right]) => left.localeCompare(right)),
    };
  }
  return { isArray: false, properties: [] };
}

function historicalShapeDifferences(current, baseline, prefix = "") {
  if (current.isArray !== baseline.isArray) return [`${prefix || "<root>"}[]`];
  if (current.isArray) return historicalShapeDifferences(current.item, baseline.item, `${prefix}[]`);
  const currentProperties = new Map(current.properties);
  const baselineProperties = new Map(baseline.properties);
  const names = new Set([...currentProperties.keys(), ...baselineProperties.keys()]);
  return [...names].filter((name) => currentProperties.get(name) !== baselineProperties.get(name)).sort();
}

function checkResponseContracts() {
  const failures = [];
  const usedExceptions = new Set();
  for (const [name, current] of currentMethods) {
    const baseline = baselineSnapshot.operations[name];
    if (!baseline) {
      failures.push(`${name}: missing from the historical frontend API baseline`);
      continue;
    }
    if (current.responseTypeNode.getText() !== baseline.responseType) {
      failures.push(`${name}: response type changed from ${baseline.responseType} to ${current.responseTypeNode.getText()}`);
    }
    let currentShape;
    try {
      currentShape = historicalShape(normalizeTypeScriptNode(current.responseTypeNode, checker));
    } catch (error) {
      failures.push(`${name}: unsupported frontend response type: ${String(error)}`);
      continue;
    }
    const baselineShape = baselineSnapshot.shapes[baseline.shape_id];
    const shapeDifferences = historicalShapeDifferences(currentShape, baselineShape);
    if (shapeDifferences.length) {
      const correction = corrections.historical_frontend_shape_changes[name];
      if (!correction) {
        failures.push(`${name}: frontend DTO shape changed without a documented correction`);
      } else {
        const expected = [...correction.fields].sort();
        if (JSON.stringify(shapeDifferences) !== JSON.stringify(expected)) {
          failures.push(`${name}: documented DTO correction fields ${expected.join(", ")} do not match actual changes ${shapeDifferences.join(", ")}`);
        }
        usedExceptions.add(name);
      }
    }
    const route = matchOpenApiRoute(current.path, current.method, openApi.paths);
    const operation = route?.[1][current.method];
    if (!operation) {
      failures.push(`${name}: no ${current.method.toUpperCase()} ${current.path} in current backend OpenAPI`);
      continue;
    }
    const responseType = normalizeTypeScriptNode(current.responseTypeNode, checker);
    for (const mismatch of checkSuccessResponses(responseType, operation.responses, openApi.components?.schemas ?? {})) {
      failures.push(`${name}: ${mismatch}`);
    }
  }
  for (const exception of Object.keys(corrections.historical_frontend_shape_changes)) {
    if (!usedExceptions.has(exception)) failures.push(`${exception}: obsolete historical DTO correction entry`);
  }
  if (Object.keys(baselineSnapshot.operations).length !== 94 || currentMethods.size !== 94) {
    failures.push(`frontend API operation count mismatch: current=${currentMethods.size}, historical=${Object.keys(baselineSnapshot.operations).length}, expected=94`);
  }
  return failures;
}

const failures = [
  ...requestContractFailures(readRequestContractCases()),
  ...checkResponseContracts(),
];

logger.log(`Current application OpenAPI generated with an isolated temporary SQLite URL.`);
logger.log(`Request contracts checked: ${currentMethods.size}/94 operations (routes, methods, query and JSON bodies).`);
logger.log(`Response contracts checked: ${currentMethods.size}/94 operations (all successful status/body schemas).`);
if (failures.length) {
  for (const failure of failures) logger.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  logger.log("No unexplained frontend/backend API contract mismatches.");
}
