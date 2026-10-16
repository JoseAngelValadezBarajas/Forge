import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import {
  checkSuccessResponses,
  compareContractTypes,
  compareRequestTypes,
  matchOpenApiRoute,
  normalizeOpenApiSchema,
  normalizeTypeScriptNode,
} from "./api-contract-verifier.mjs";

function withTsType(source, typeName, action) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "forge-contract-fixture-"));
  const filename = path.join(directory, "fixture.ts");
  try {
    writeFileSync(filename, source, "utf8");
    const program = ts.createProgram({ rootNames: [filename], options: { strict: true, target: ts.ScriptTarget.ES2022 } });
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(filename);
    const declaration = sourceFile.statements.find((item) => ts.isTypeAliasDeclaration(item) && item.name.text === typeName);
    assert.ok(declaration, `fixture did not declare ${typeName}`);
    return action(normalizeTypeScriptNode(declaration.type, checker));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function object(properties, required = Object.keys(properties)) {
  return { type: "object", properties, required };
}

test("rejects a missing required response property independently", () => {
  withTsType("type Contract = { name: string }", "Contract", (frontend) => {
    const backend = normalizeOpenApiSchema(object({ name: { type: "string" }, id: { type: "string" } }));
    assert.ok(compareContractTypes(frontend, backend).some((item) => item === "id: missing from frontend DTO"));
  });
});

test("rejects incorrect response optionality independently", () => {
  withTsType("type Contract = { name?: string }", "Contract", (frontend) => {
    const backend = normalizeOpenApiSchema(object({ name: { type: "string" } }));
    assert.ok(compareContractTypes(frontend, backend).some((item) => item.includes("name: frontend optional, OpenAPI required")));
  });
});

test("rejects nullability mismatches independently", () => {
  withTsType("type Contract = { name: string }", "Contract", (frontend) => {
    const backend = normalizeOpenApiSchema(object({ name: { anyOf: [{ type: "string" }, { type: "null" }] } }));
    assert.ok(compareContractTypes(frontend, backend).some((item) => item.startsWith("name:")));
  });
});

test("rejects nested scalar type drift", () => {
  withTsType("type Contract = { metadata: { attempt: string } }", "Contract", (frontend) => {
    const backend = normalizeOpenApiSchema(object({ metadata: object({ attempt: { type: "integer" } }) }));
    assert.ok(compareContractTypes(frontend, backend).some((item) => item.startsWith("metadata.attempt:")));
  });
});

test("retains OpenAPI integer semantics while matching JavaScript number representation", () => {
  withTsType("type Contract = number", "Contract", (frontend) => {
    const backend = normalizeOpenApiSchema({ type: "integer" });
    assert.equal(backend.kind, "integer");
    assert.deepEqual(compareContractTypes(frontend, backend), []);
    assert.deepEqual(compareRequestTypes(frontend, backend), []);
  });
});

test("rejects incorrect array element types", () => {
  withTsType("type Contract = { ids: string[] }", "Contract", (frontend) => {
    const backend = normalizeOpenApiSchema(object({ ids: { type: "array", items: { type: "integer" } } }));
    assert.ok(compareContractTypes(frontend, backend).some((item) => item.startsWith("ids[]:")));
  });
});

test("rejects incorrect enum values", () => {
  withTsType('type Contract = { state: "open" | "closed" }', "Contract", (frontend) => {
    const backend = normalizeOpenApiSchema(object({ state: { type: "string", enum: ["open", "archived"] } }));
    assert.ok(compareContractTypes(frontend, backend).some((item) => item.startsWith("state:")));
  });
});

test("rejects an invalid OpenAPI reference instead of treating it as an empty object", () => {
  assert.throws(
    () => normalizeOpenApiSchema({ $ref: "#/components/schemas/Missing" }, {}),
    /Unresolved OpenAPI reference/,
  );
});

test("fails unsupported TypeScript object types instead of normalizing them to empty shapes", () => {
  assert.throws(
    () => withTsType("type Contract = Date", "Contract", (frontend) => frontend),
    /Unsupported (non-data|callable) TypeScript contract type/,
  );
  assert.throws(
    () => withTsType("type Contract = () => void", "Contract", (frontend) => frontend),
    /Unsupported callable TypeScript contract type/,
  );
});

test("rejects incompatible successful status and body definitions", () => {
  const failures = checkSuccessResponses(
    { kind: "undefined" },
    { "204": { description: "No content", content: { "application/json": { schema: { type: "string" } } } } },
    {},
  );
  assert.ok(failures.some((item) => item.includes("204: a no-content success status declares a JSON response body")));
});

test("rejects a successful response body with the wrong scalar type", () => {
  withTsType("type Contract = string", "Contract", (frontend) => {
    const failures = checkSuccessResponses(
      frontend,
      { "201": { description: "Created", content: { "application/json": { schema: { type: "integer" } } } } },
      {},
    );
    assert.ok(failures.some((item) => item.startsWith("201 <root>: frontend")));
  });
});

test("rejects request-body scalar drift independently", () => {
  withTsType("type Contract = { revision: string }", "Contract", (frontend) => {
    const backend = normalizeOpenApiSchema(object({ revision: { type: "integer" } }));
    const failures = compareRequestTypes(frontend, backend);
    assert.ok(failures.some((item) => item.includes("revision")));
  });
});

test("rejects a frontend-optional property when the backend requires it", () => {
  withTsType("type Contract = { revision?: number }", "Contract", (frontend) => {
    const backend = normalizeOpenApiSchema(object({ revision: { type: "integer" } }));
    assert.ok(compareRequestTypes(frontend, backend).some((item) => item.includes("revision: frontend request field is optional")));
  });
});

test("resolves TypeScript aliases and OpenAPI compositions with branch-local references", () => {
  withTsType(
    'type Base = { id: string }; type Contract = Base & { state: "ready" | "blocked"; note: string | null; rows: { count: number }[] }',
    "Contract",
    (frontend) => {
      const backend = normalizeOpenApiSchema({
        allOf: [
          { $ref: "#/components/schemas/Base" },
          object({
            state: { oneOf: [{ const: "ready", type: "string" }, { const: "blocked", type: "string" }] },
            note: { anyOf: [{ type: "string" }, { type: "null" }] },
            rows: { type: "array", items: object({ count: { type: "number" } }) },
          }),
        ],
      }, { Base: object({ id: { type: "string" } }) });
      assert.deepEqual(compareContractTypes(frontend, backend), []);
    },
  );
});

test("normalizes recursive refs without contaminating sibling branches", () => {
  withTsType("type LinkNode = { value: string; next?: LinkNode | null }; type Contract = { left: LinkNode; right: LinkNode }", "Contract", (frontend) => {
    const node = object({
      value: { type: "string" },
      next: { anyOf: [{ $ref: "#/components/schemas/Node" }, { type: "null" }] },
    }, ["value"]);
    const backend = normalizeOpenApiSchema(object({ left: { $ref: "#/components/schemas/Node" }, right: { $ref: "#/components/schemas/Node" } }), { Node: node });
    assert.deepEqual(compareContractTypes(frontend, backend), []);
  });
});

test("requires route templates to match literals and parameter positions unambiguously", () => {
  const paths = {
    "/api/projects/{project_id}/features/{feature_id}": { get: {} },
    "/api/projects/{project_id}/features/{feature_id}/history": { get: {} },
  };
  assert.equal(matchOpenApiRoute("/api/projects/{id}/features/{feature}", "get", paths)[0], "/api/projects/{project_id}/features/{feature_id}");
  assert.equal(matchOpenApiRoute("/api/projects/fixed/features/{feature}", "get", paths), undefined);
  assert.throws(() => matchOpenApiRoute("/api/projects/{id}/features/{feature}", "get", {
    "/api/projects/{project_id}/features/{feature_id}": { get: {} },
    "/api/projects/{workspace_id}/features/{feature_id}": { get: {} },
  }), /Ambiguous OpenAPI route/);
});
