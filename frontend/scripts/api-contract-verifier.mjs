import ts from "typescript";

const primitiveFlags = [
  [ts.TypeFlags.StringLike, "string"],
  [ts.TypeFlags.NumberLike, "number"],
  [ts.TypeFlags.BooleanLike, "boolean"],
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function unionOf(items) {
  const flattened = items.flatMap((item) => item?.kind === "union" ? item.types : [item]);
  const hasTrue = flattened.some((item) => item.kind === "literal" && item.value === true);
  const hasFalse = flattened.some((item) => item.kind === "literal" && item.value === false);
  const collapsed = hasTrue && hasFalse
    ? [...flattened.filter((item) => !(item.kind === "literal" && typeof item.value === "boolean")), { kind: "boolean" }]
    : flattened;
  const unique = new Map(collapsed.map((item) => [stable(item), item]));
  const values = [...unique.values()].sort((left, right) => stable(left).localeCompare(stable(right)));
  if (!values.length) return { kind: "never" };
  if (values.length === 2 && values.every((item) => item.kind === "literal" && typeof item.value === "boolean")) {
    return { kind: "boolean" };
  }
  if (values.length === 1) return values[0];
  return { kind: "union", types: values };
}

function withoutUndefined(type) {
  if (type.kind !== "union") return type.kind === "undefined" ? { kind: "never" } : type;
  return unionOf(type.types.filter((item) => item.kind !== "undefined"));
}

function tsTypeId(type) {
  return type.id ?? type;
}

export function normalizeTypeScriptType(type, checker, ancestors = new Set()) {
  if (type.flags & ts.TypeFlags.Any || type.flags & ts.TypeFlags.Unknown) {
    return { kind: "unknown" };
  }
  if (type.flags & ts.TypeFlags.Never) return { kind: "never" };
  if (type.flags & ts.TypeFlags.Null) return { kind: "null" };
  if (type.flags & ts.TypeFlags.Undefined) return { kind: "undefined" };
  if (type.flags & ts.TypeFlags.Void) return { kind: "undefined" };
  if (type.flags & ts.TypeFlags.StringLiteral) return { kind: "literal", value: type.value };
  if (type.flags & ts.TypeFlags.NumberLiteral) return { kind: "literal", value: type.value };
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return { kind: "literal", value: type.intrinsicName === "true" };
  }
  for (const [flag, kind] of primitiveFlags) {
    if (type.flags & flag) return { kind };
  }
  if (type.flags & ts.TypeFlags.Union) {
    return unionOf(type.types.map((item) => normalizeTypeScriptType(item, checker, new Set(ancestors))));
  }

  if (!(type.flags & ts.TypeFlags.Object) && !(type.flags & ts.TypeFlags.Intersection)) {
    throw new Error(`Unsupported TypeScript contract type: ${checker.typeToString(type)}`);
  }

  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const itemTypes = checker.getTypeArguments(type);
    return { kind: "array", items: unionOf(itemTypes.map((item) => normalizeTypeScriptType(item, checker, new Set(ancestors)))) };
  }

  if (
    checker.getSignaturesOfType(type, ts.SignatureKind.Call).length ||
    checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length
  ) {
    throw new Error(`Unsupported callable TypeScript contract type: ${checker.typeToString(type)}`);
  }

  const typeId = tsTypeId(type);
  if (ancestors.has(typeId)) return { kind: "recursive" };
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(typeId);

  const properties = {};
  const symbols = checker.getPropertiesOfType(type);
  const serializableSymbols = symbols.filter((symbol) =>
    !(symbol.flags & ts.SymbolFlags.Method) &&
    !(symbol.flags & ts.SymbolFlags.GetAccessor) &&
    !(symbol.flags & ts.SymbolFlags.SetAccessor),
  );
  const stringIndex = checker.getIndexInfosOfType(type).find((item) => item.keyType.flags & ts.TypeFlags.StringLike);
  if (!serializableSymbols.length && !stringIndex && symbols.length) {
    throw new Error(`Unsupported non-data TypeScript contract type: ${checker.typeToString(type)}`);
  }
  for (const symbol of serializableSymbols) {
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!declaration) continue;
    const propertyType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const normalized = normalizeTypeScriptType(propertyType, checker, new Set(nextAncestors));
    const optional = Boolean(symbol.flags & ts.SymbolFlags.Optional) || containsUndefined(normalized);
    properties[symbol.getName()] = {
      optional,
      type: optional ? withoutUndefined(normalized) : normalized,
    };
  }

  return {
    kind: "object",
    properties,
    additionalProperties: stringIndex
      ? normalizeTypeScriptType(stringIndex.type, checker, new Set(nextAncestors))
      : { kind: "never" },
  };
}

export function normalizeTypeScriptNode(node, checker) {
  return normalizeTypeScriptType(checker.getTypeFromTypeNode(node), checker);
}

export function normalizeTypeScriptExpression(node, checker) {
  return normalizeTypeScriptType(checker.getTypeAtLocation(node), checker);
}

function openApiType(kind) {
  if (kind === "integer") return { kind: "integer" };
  if (kind === "number") return { kind: "number" };
  if (["string", "boolean", "null"].includes(kind)) return { kind };
  if (kind === "array") return { kind: "array", items: { kind: "unknown" } };
  if (kind === "object") return { kind: "object", properties: {}, additionalProperties: { kind: "never" } };
  throw new Error(`Unsupported OpenAPI schema type: ${kind}`);
}

function mergeAllOf(branches) {
  if (branches.every((item) => item.kind === "object")) {
    const properties = {};
    for (const branch of branches) {
      for (const [name, property] of Object.entries(branch.properties)) {
        const existing = properties[name];
        if (!existing) {
          properties[name] = property;
        } else {
          properties[name] = {
            optional: existing.optional && property.optional,
            type: intersectTypes(existing.type, property.type),
          };
        }
      }
    }
    const indexes = branches.map((item) => item.additionalProperties).filter((item) => item.kind !== "never");
    return {
      kind: "object",
      properties,
      additionalProperties: indexes.length ? unionOf(indexes) : { kind: "never" },
    };
  }
  return { kind: "intersection", types: branches };
}

function intersectTypes(left, right) {
  if (stable(left) === stable(right)) return left;
  if (left.kind === "never" || right.kind === "never") return { kind: "never" };
  if (left.kind === "integer" && right.kind === "number" || left.kind === "number" && right.kind === "integer") {
    return { kind: "integer" };
  }
  if (left.kind === "unknown") return right;
  if (right.kind === "unknown") return left;
  if (left.kind === "union") return unionOf(left.types.map((item) => intersectTypes(item, right)).filter((item) => item.kind !== "never"));
  if (right.kind === "union") return unionOf(right.types.map((item) => intersectTypes(left, item)).filter((item) => item.kind !== "never"));
  if (left.kind === "literal" && right.kind !== "literal") {
    const literalType = left.value === null ? "null" : typeof left.value;
    return literalType === right.kind ? left : { kind: "never" };
  }
  if (right.kind === "literal" && left.kind !== "literal") return intersectTypes(right, left);
  if (left.kind === "object" && right.kind === "object") return mergeAllOf([left, right]);
  return { kind: "never" };
}

export function normalizeOpenApiSchema(schema, components = {}, refStack = new Set()) {
  if (schema === true) return { kind: "unknown" };
  if (schema === false) return { kind: "never" };
  if (!schema || typeof schema !== "object") throw new Error("Missing or invalid OpenAPI schema");

  let referenced;
  if (schema.$ref) {
    const prefix = "#/components/schemas/";
    if (!schema.$ref.startsWith(prefix)) throw new Error(`Unsupported OpenAPI reference: ${schema.$ref}`);
    const name = schema.$ref.slice(prefix.length);
    if (!name || !Object.hasOwn(components, name)) throw new Error(`Unresolved OpenAPI reference: ${schema.$ref}`);
    if (refStack.has(name)) return { kind: "recursive" };
    referenced = normalizeOpenApiSchema(components[name], components, new Set([...refStack, name]));
    const siblings = { ...schema };
    delete siblings.$ref;
    if (Object.keys(siblings).length === 0) return referenced;
    return intersectTypes(referenced, normalizeOpenApiSchema(siblings, components, new Set(refStack)));
  }

  const alternatives = [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])];
  if (alternatives.length) {
    const union = unionOf(alternatives.map((item) => normalizeOpenApiSchema(item, components, new Set(refStack))));
    const additions = { ...schema };
    delete additions.oneOf;
    delete additions.anyOf;
    const hasOtherSchema = Object.keys(additions).some((key) => !["title", "description", "default", "examples", "discriminator"].includes(key));
    const combined = hasOtherSchema
      ? mergeAllOf([union, normalizeOpenApiSchema(additions, components, new Set(refStack))])
      : union;
    return schema.nullable ? unionOf([combined, { kind: "null" }]) : combined;
  }

  const allOf = (schema.allOf ?? []).map((item) => normalizeOpenApiSchema(item, components, new Set(refStack)));
  const local = { ...schema };
  delete local.allOf;
  const ignored = new Set(["title", "description", "default", "examples", "deprecated", "readOnly", "writeOnly", "discriminator"]);
  const hasLocalSchema = Object.keys(local).some((key) => !ignored.has(key));
  let result = allOf.length
    ? (() => {
      const branches = hasLocalSchema ? [...allOf, normalizeOpenApiSchema(local, components, new Set(refStack))] : allOf;
      return branches.every((item) => item.kind === "object") ? mergeAllOf(branches) : branches.reduce(intersectTypes);
    })()
    : normalizeOpenApiBase(local, components, refStack);
  if (schema.nullable) result = unionOf([result, { kind: "null" }]);
  return result;
}

function normalizeOpenApiBase(schema, components, refStack) {
  if (schema.const !== undefined) return { kind: "literal", value: schema.const };
  if (Array.isArray(schema.enum)) {
    return unionOf(schema.enum.map((value) => value === null ? { kind: "null" } : { kind: "literal", value }));
  }
  if (Array.isArray(schema.type)) {
    return unionOf(schema.type.map((kind) => normalizeOpenApiBase({ ...schema, type: kind }, components, new Set(refStack))));
  }
  if (schema.type === "array" || schema.items) {
    return {
      kind: "array",
      items: normalizeOpenApiSchema(schema.items, components, new Set(refStack)),
    };
  }
  if (schema.type === "object" || schema.properties || schema.additionalProperties !== undefined) {
    const required = new Set(schema.required ?? []);
    const properties = {};
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      properties[name] = {
        optional: !required.has(name),
        type: normalizeOpenApiSchema(property, components, new Set(refStack)),
      };
    }
    const additional = schema.additionalProperties;
    return {
      kind: "object",
      properties,
      additionalProperties: additional === undefined || additional === false
        ? { kind: "never" }
        : additional === true
          ? { kind: "unknown" }
          : normalizeOpenApiSchema(additional, components, new Set(refStack)),
    };
  }
  if (schema.type) return openApiType(schema.type);
  if (Object.keys(schema).every((key) => ["title", "description", "default", "examples", "format"].includes(key))) {
    return { kind: "unknown" };
  }
  throw new Error(`Unsupported OpenAPI schema form: ${stable(schema)}`);
}

function containsUndefined(type) {
  return type.kind === "undefined" || (type.kind === "union" && type.types.some((item) => containsUndefined(item)));
}

function nodeDiff(frontend, backend, at) {
  if (contractEquivalent(frontend, backend)) return [];
  if (frontend.kind === "object" && backend.kind === "object") {
    const diffs = [];
    const names = new Set([...Object.keys(frontend.properties), ...Object.keys(backend.properties)]);
    for (const name of [...names].sort()) {
      const left = frontend.properties[name];
      const right = backend.properties[name];
      const fieldPath = at ? `${at}.${name}` : name;
      if (!left) diffs.push(`${fieldPath}: missing from frontend DTO`);
      else if (!right) diffs.push(`${fieldPath}: missing from OpenAPI response`);
      else {
        if (left.optional !== right.optional) diffs.push(`${fieldPath}: frontend ${left.optional ? "optional" : "required"}, OpenAPI ${right.optional ? "optional" : "required"}`);
        diffs.push(...nodeDiff(left.type, right.type, fieldPath));
      }
    }
    diffs.push(...nodeDiff(frontend.additionalProperties, backend.additionalProperties, `${at || "<root>"}.*`));
    return diffs;
  }
  if (frontend.kind === "array" && backend.kind === "array") return nodeDiff(frontend.items, backend.items, `${at}[]`);
  return [`${at || "<root>"}: frontend ${stable(frontend)}, OpenAPI ${stable(backend)}`];
}

function contractEquivalent(frontend, backend) {
  if (stable(frontend) === stable(backend)) return true;
  // TypeScript has one numeric primitive; integer-ness remains enforced by FastAPI/Pydantic.
  if (frontend.kind === "number" && backend.kind === "integer") return true;
  if (frontend.kind === "array" && backend.kind === "array") {
    return contractEquivalent(frontend.items, backend.items);
  }
  if (frontend.kind === "union" && backend.kind === "union") {
    if (frontend.types.length !== backend.types.length) return false;
    const unmatched = [...frontend.types];
    for (const right of backend.types) {
      const index = unmatched.findIndex((left) => contractEquivalent(left, right));
      if (index < 0) return false;
      unmatched.splice(index, 1);
    }
    return unmatched.length === 0;
  }
  if (frontend.kind === "object" && backend.kind === "object") {
    const frontendNames = Object.keys(frontend.properties).sort();
    const backendNames = Object.keys(backend.properties).sort();
    return JSON.stringify(frontendNames) === JSON.stringify(backendNames) &&
      frontendNames.every((name) =>
        frontend.properties[name].optional === backend.properties[name].optional &&
        contractEquivalent(frontend.properties[name].type, backend.properties[name].type),
      ) && contractEquivalent(frontend.additionalProperties, backend.additionalProperties);
  }
  return false;
}

export function compareContractTypes(frontend, backend) {
  return nodeDiff(frontend, backend, "");
}

export function compareRequestTypes(frontend, backend, at = "") {
  if (backend.kind === "unknown" || frontend.kind === "never") return [];
  if (frontend.kind === "union") {
    return frontend.types
      .filter((item) => item.kind !== "undefined")
      .flatMap((item) => compareRequestTypes(item, backend, at));
  }
  if (backend.kind === "union") {
    const compatible = backend.types.some((item) => compareRequestTypes(frontend, item, at).length === 0);
    return compatible ? [] : [`${at || "<root>"}: frontend ${stable(frontend)} is not accepted by backend ${stable(backend)}`];
  }
  if (frontend.kind === "literal") {
    if (backend.kind === "literal") return Object.is(frontend.value, backend.value) ? [] : [`${at || "<root>"}: literal ${JSON.stringify(frontend.value)} is not accepted; expected ${JSON.stringify(backend.value)}`];
    const primitive = frontend.value === null ? "null" : typeof frontend.value;
    return primitive === backend.kind || primitive === "number" && backend.kind === "integer"
      ? []
      : [`${at || "<root>"}: literal ${JSON.stringify(frontend.value)} is incompatible with ${backend.kind}`];
  }
  // Numeric values share the JSON representation; backend integer validation remains authoritative.
  if (frontend.kind === "number" && backend.kind === "integer") return [];
  if (frontend.kind !== backend.kind) return [`${at || "<root>"}: frontend ${frontend.kind}, backend ${backend.kind}`];
  if (frontend.kind === "array") return compareRequestTypes(frontend.items, backend.items, `${at}[]`);
  if (frontend.kind === "object") {
    const failures = [];
    for (const [name, backendProperty] of Object.entries(backend.properties)) {
      const frontendProperty = frontend.properties[name];
      const field = at ? `${at}.${name}` : name;
      if (!frontendProperty) {
        if (!backendProperty.optional) failures.push(`${field}: required backend field is missing from the frontend request type`);
        continue;
      }
      if (!backendProperty.optional && frontendProperty.optional) failures.push(`${field}: frontend request field is optional but backend requires it`);
      failures.push(...compareRequestTypes(frontendProperty.type, backendProperty.type, field));
    }
    for (const [name, frontendProperty] of Object.entries(frontend.properties)) {
      if (Object.hasOwn(backend.properties, name)) continue;
      const field = at ? `${at}.${name}` : name;
      if (backend.additionalProperties.kind === "never") failures.push(`${field}: field is not accepted by backend`);
      else failures.push(...compareRequestTypes(frontendProperty.type, backend.additionalProperties, field));
    }
    if (frontend.additionalProperties.kind !== "never") {
      failures.push(...compareRequestTypes(frontend.additionalProperties, backend.additionalProperties, `${at || "<root>"}.*`));
    }
    return failures;
  }
  return compareContractTypes(frontend, backend).map((item) => at ? `${at} ${item}` : item);
}

export function isVoidType(type) {
  return type.kind === "undefined" || type.kind === "never";
}

export function checkSuccessResponses(responseType, responses, components) {
  const successes = Object.entries(responses ?? {}).filter(([status]) => /^2(?:\d\d|XX)$/i.test(status));
  if (!successes.length) return ["backend operation has no successful HTTP response"];
  const failures = [];
  let checkedBody = false;
  for (const [status, response] of successes) {
    const schema = response.content?.["application/json"]?.schema;
    if (!schema) {
      if (!isVoidType(responseType) && status !== "204") failures.push(`${status}: no JSON response body for a typed frontend response`);
      continue;
    }
    if (status === "204") {
      failures.push("204: a no-content success status declares a JSON response body");
      continue;
    }
    if (isVoidType(responseType)) {
      failures.push(`${status}: backend returns a JSON body for a void frontend response`);
      continue;
    }
    const backend = normalizeOpenApiSchema(schema, components);
    failures.push(...compareContractTypes(responseType, backend).map((item) => `${status} ${item}`));
    checkedBody = true;
  }
  if (!isVoidType(responseType) && !checkedBody && !failures.length) failures.push("no successful response body matches the frontend response type");
  return failures;
}

function isParameterSegment(segment) {
  return /^\{[^{}]+\}$/.test(segment);
}

export function matchOpenApiRoute(pathPattern, method, paths) {
  const expected = pathPattern.split("/");
  const matches = Object.entries(paths).filter(([template, operations]) => {
    const actual = template.split("/");
    if (!operations[method] || actual.length !== expected.length) return false;
    return actual.every((segment, index) =>
      isParameterSegment(segment) && isParameterSegment(expected[index]) || segment === expected[index],
    );
  });
  if (matches.length > 1) throw new Error(`Ambiguous OpenAPI route for ${method.toUpperCase()} ${pathPattern}: ${matches.map(([route]) => route).join(", ")}`);
  return matches[0];
}
