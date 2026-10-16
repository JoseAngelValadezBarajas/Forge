import { readFileSync, readdirSync } from "node:fs";
import { Console } from "node:console";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URLSearchParams } from "node:url";
import ts from "typescript";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(frontendRoot, "..");
const logger = new Console({ stdout: process.stdout, stderr: process.stderr });
const openApiPath = path.join(repositoryRoot, "backend/tests/fixtures/rfx01b-openapi-baseline.json");
const openApi = JSON.parse(readFileSync(openApiPath, "utf8"));
const baselinePath = path.join(frontendRoot, "tests/fixtures/rfx02d-api-response-baseline.json");
const baselineSnapshot = JSON.parse(readFileSync(baselinePath, "utf8"));

function apiObject(sourceFile, variableName) {
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((item) => ts.isIdentifier(item.name) && item.name.text === variableName);
  return declaration?.initializer && ts.isObjectLiteralExpression(declaration.initializer)
    ? declaration.initializer
    : undefined;
}

function propertyName(property) {
  return property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ? property.name.text
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

function apiMethods(sourceFile, objectName) {
  const object = apiObject(sourceFile, objectName);
  if (!object) return new Map();
  const result = new Map();
  for (const property of object.properties) {
    const name = propertyName(property);
    if (!name) continue;
    const call = findRequestCall(property);
    if (!call?.typeArguments?.[0] || !call.arguments[0] || !ts.isObjectLiteralExpression(call.arguments[1] ?? ts.factory.createObjectLiteralExpression())) {
      if (!call?.typeArguments?.[0] || !call.arguments[0]) throw new Error(`Missing typed request call for ${name}`);
    }
    const pathPattern = routePattern(call.arguments[0]);
    const options = call.arguments[1] && ts.isObjectLiteralExpression(call.arguments[1]) ? call.arguments[1] : undefined;
    const methodProperty = options?.properties.find((item) => propertyName(item) === "method");
    const method = methodProperty && ts.isPropertyAssignment(methodProperty) && ts.isStringLiteral(methodProperty.initializer)
      ? methodProperty.initializer.text.toLowerCase()
      : "get";
    result.set(name, { path: `/api${pathPattern}`, method, responseType: call.typeArguments[0] });
  }
  return result;
}

function findFeatureModules(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...findFeatureModules(entryPath));
    else if (entry.name === "index.ts" && path.basename(directory) === "api") result.push(entryPath);
  }
  return result;
}

const currentMethods = new Map();
const currentTypeAliases = new Map();
for (const modulePath of findFeatureModules(path.join(frontendRoot, "src/features"))) {
  const sourceFile = ts.createSourceFile(modulePath, readFileSync(modulePath, "utf8"), ts.ScriptTarget.Latest, true);
  const apiVariable = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((item) => ts.isIdentifier(item.name) && item.name.text.endsWith("Api"));
  if (!apiVariable || !ts.isIdentifier(apiVariable.name)) throw new Error(`Missing API object in ${modulePath}`);
  for (const [name, operation] of apiMethods(sourceFile, apiVariable.name.text)) currentMethods.set(name, operation);

  const contractPath = path.join(path.dirname(modulePath), "contracts.ts");
  const contracts = ts.createSourceFile(contractPath, readFileSync(contractPath, "utf8"), ts.ScriptTarget.Latest, true);
  for (const declaration of contracts.statements.filter(ts.isTypeAliasDeclaration)) {
    currentTypeAliases.set(declaration.name.text, declaration);
  }
}

function matchingRoute(pathPattern, method) {
  const expected = pathPattern.split("/");
  return Object.entries(openApi.paths).find(([template]) => {
    const actual = template.split("/");
    return actual.length === expected.length && actual.every((segment, index) =>
      (segment.startsWith("{") && segment.endsWith("}")) || segment === expected[index] ||
      (expected[index].startsWith("{") && expected[index].endsWith("}")),
    ) && Boolean(openApi.paths[template][method]);
  });
}

function objectProperty(object, name) {
  return object.properties.find((property) => propertyName(property) === name);
}

function literalString(property) {
  return property && ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)
    ? property.initializer.text
    : undefined;
}

function serializedBodyFields(property) {
  if (!property || !ts.isPropertyAssignment(property) || !ts.isCallExpression(property.initializer)) return undefined;
  const call = property.initializer;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "jsonBody" || !call.arguments[0] || !ts.isObjectLiteralExpression(call.arguments[0])) return undefined;
  const fields = [];
  for (const member of call.arguments[0].properties) {
    if (!ts.isPropertyAssignment(member)) throw new Error(`Unsupported body fixture expression: ${member.getText()}`);
    if (member.initializer.getText() !== "undefined") fields.push(propertyName(member));
  }
  return fields;
}

function readRequestContractCases() {
  const sourceDirectory = path.join(frontendRoot, "src");
  const result = [];
  for (const filename of readdirSync(sourceDirectory).filter((name) => /^api\..*\.test\.ts$/.test(name))) {
    const filePath = path.join(sourceDirectory, filename);
    const source = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true);
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

function verifyRequestContracts(cases) {
  const failures = [];
  for (const contract of cases) {
    const [pathPattern, query = ""] = contract.url.split("?", 2);
    const route = matchingRoute(pathPattern, contract.method);
    const operation = route?.[1][contract.method];
    if (!operation) {
      failures.push(`${contract.name}: ${contract.method.toUpperCase()} ${pathPattern} is absent from backend OpenAPI`);
      continue;
    }
    if (!Object.keys(operation.responses ?? {}).some((status) => status.startsWith("2"))) {
      failures.push(`${contract.name}: backend operation has no successful response`);
    }
    const queryParameters = new Set((operation.parameters ?? [])
      .filter((parameter) => parameter.in === "query")
      .map((parameter) => parameter.name));
    for (const name of new URLSearchParams(query).keys()) {
      if (!queryParameters.has(name)) failures.push(`${contract.name}: query parameter ${name} is absent from backend OpenAPI`);
    }
    if (contract.bodyFields) {
      const requestSchema = resolveOpenApiSchema(operation.requestBody?.content?.["application/json"]?.schema);
      if (!requestSchema) {
        failures.push(`${contract.name}: JSON request body is absent from backend OpenAPI`);
        continue;
      }
      const properties = new Set(Object.keys(requestSchema.properties ?? {}));
      const required = new Set(requestSchema.required ?? []);
      for (const field of contract.bodyFields) {
        if (!properties.has(field)) failures.push(`${contract.name}: request field ${field} is absent from backend OpenAPI`);
      }
      for (const field of required) {
        if (!contract.bodyFields.includes(field)) failures.push(`${contract.name}: required request field ${field} is absent from its fixture`);
      }
    }
  }
  const methodNames = new Set(cases.map(({ name }) => name));
  if (methodNames.size !== 94) failures.push(`characterized operation count is ${methodNames.size}, expected 94`);
  for (const failure of failures) logger.error(`- ${failure}`);
  if (failures.length) process.exit(1);
  logger.log(`Request contracts checked: ${methodNames.size}/94 operations against backend routes, methods, query parameters and request DTO fields.`);
}

function resolveOpenApiSchema(schema, seen = new Set()) {
  if (!schema) return undefined;
  if (schema.$ref) {
    const name = schema.$ref.split("/").at(-1);
    if (!name || seen.has(name)) return undefined;
    seen.add(name);
    return resolveOpenApiSchema(openApi.components.schemas[name], seen);
  }
  const branches = [...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]
    .map((item) => resolveOpenApiSchema(item, seen))
    .filter(Boolean);
  const properties = { ...(schema.properties ?? {}) };
  const required = new Set(schema.required ?? []);
  for (const branch of branches) {
    Object.assign(properties, branch.properties ?? {});
    for (const key of branch.required ?? []) required.add(key);
  }
  return { ...schema, properties, required: [...required] };
}

function typeProperties(typeNode, aliases, seen = new Set()) {
  if (ts.isParenthesizedTypeNode(typeNode)) return typeProperties(typeNode.type, aliases, seen);
  if (ts.isArrayTypeNode(typeNode)) return { isArray: true, item: typeProperties(typeNode.elementType, aliases, seen) };
  if (ts.isIntersectionTypeNode(typeNode)) {
    const shapes = typeNode.types.map((item) => typeProperties(item, aliases, seen));
    const properties = new Map(shapes.flatMap((shape) => [...(shape.properties ?? [])]));
    return { isArray: false, properties };
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    const properties = new Map();
    for (const member of typeNode.members) {
      if (!ts.isPropertySignature(member) || !member.type) continue;
      const name = propertyName(member);
      if (name) properties.set(name, { optional: Boolean(member.questionToken), type: member.type });
    }
    return { isArray: false, properties };
  }
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const name = typeNode.typeName.text;
    const alias = aliases.get(name);
    if (!alias || seen.has(name)) return { isArray: false, properties: new Map() };
    seen.add(name);
    return typeProperties(alias.type, aliases, seen);
  }
  if (ts.isUnionTypeNode(typeNode)) {
    const objectTypes = typeNode.types.filter((item) => !ts.isLiteralTypeNode(item) || item.literal.kind !== ts.SyntaxKind.NullKeyword);
    return objectTypes.length === 1 ? typeProperties(objectTypes[0], aliases, seen) : { isArray: false, properties: new Map() };
  }
  return { isArray: false, properties: new Map() };
}

function normalizedTypeShape(typeNode, aliases) {
  const shape = typeProperties(typeNode, aliases);
  if (shape.isArray) return { isArray: true, item: normalizedTypeShapeFromShape(shape.item) };
  return { isArray: false, properties: [...(shape.properties ?? new Map()).entries()]
    .map(([name, value]) => [name, Boolean(value.optional)])
    .sort(([left], [right]) => left.localeCompare(right)) };
}

function normalizedTypeShapeFromShape(shape) {
  if (shape?.isArray) return { isArray: true, item: normalizedTypeShapeFromShape(shape.item) };
  return { isArray: false, properties: [...(shape?.properties ?? new Map()).entries()]
    .map(([name, value]) => [name, Boolean(value.optional)])
    .sort(([left], [right]) => left.localeCompare(right)) };
}

function normalizedOpenApiShape(schema) {
  if (schema?.type === "array") return { isArray: true, item: normalizedOpenApiShape(resolveOpenApiSchema(schema.items)) };
  return { isArray: false, properties: Object.keys(schema?.properties ?? {}).sort().map((name) => [name, !(schema.required ?? []).includes(name)]) };
}

const failures = [];
const preexistingMismatches = [];
const requestCases = readRequestContractCases();
verifyRequestContracts(requestCases);
for (const [name, current] of currentMethods) {
  const baseline = baselineSnapshot.operations[name];
  if (!baseline) {
    failures.push(`${name}: missing from the baseline forgeApi`);
    continue;
  }
  const baselineResponseType = baseline.responseType;
  const baselineShape = baselineSnapshot.shapes[baseline.shape_id];
  if (current.responseType.getText() !== baselineResponseType) {
    failures.push(`${name}: response type changed from ${baselineResponseType} to ${current.responseType.getText()}`);
  }
  const currentShape = normalizedTypeShape(current.responseType, currentTypeAliases);
  if (JSON.stringify(currentShape) !== JSON.stringify(baselineShape)) failures.push(`${name}: response DTO shape changed during extraction`);
  const route = matchingRoute(current.path, current.method);
  const operation = route?.[1][current.method];
  if (!operation) {
    failures.push(`${name}: no ${current.method.toUpperCase()} ${current.path} in backend OpenAPI`);
    continue;
  }
  const responseEntry = Object.entries(operation.responses ?? {}).find(([status, response]) =>
    status.startsWith("2") && response.content?.["application/json"]?.schema,
  );
  const declaredVoid = current.responseType.kind === ts.SyntaxKind.VoidKeyword;
  if (!responseEntry && !declaredVoid) {
    failures.push(`${name}: backend has no JSON success schema for frontend response ${current.responseType.getText()}`);
    continue;
  }
  if (!responseEntry) continue;

  const openApiSchema = resolveOpenApiSchema(responseEntry[1].content["application/json"].schema);
  const backendShape = normalizedOpenApiShape(openApiSchema);
  if (JSON.stringify(currentShape) !== JSON.stringify(backendShape)) {
    preexistingMismatches.push({ name, frontend: currentShape, backend: backendShape });
  }
}

const baselineOperationCount = Object.keys(baselineSnapshot.operations).length;
if (currentMethods.size !== 94 || baselineOperationCount !== 94) {
  failures.push(`operation count mismatch: current=${currentMethods.size}, baseline=${baselineOperationCount}, expected=94`);
}

logger.log(`Response contracts checked: ${currentMethods.size}/94 operations against the frozen backend OpenAPI baseline.`);
if (preexistingMismatches.length) {
  logger.warn(`Preexisting top-level response DTO property/requiredness discrepancies in ${preexistingMismatches.length} operations (unchanged by RFX-02D): ${preexistingMismatches.map(({ name }) => name).join(", ")}`);
  if (process.argv.includes("--verbose")) {
    for (const mismatch of preexistingMismatches) logger.warn(`- ${mismatch.name}: frontend ${JSON.stringify(mismatch.frontend)}; backend ${JSON.stringify(mismatch.backend)}`);
  }
}
if (failures.length) {
  for (const failure of failures) logger.error(`- ${failure}`);
  process.exit(1);
}
logger.log("No response DTO changes or backend route regressions were introduced by the refactor.");
