/// <reference types="node" />

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const baselinePaths = [
  "/",
  "/projects",
  "/projects/:projectId",
  "/projects/:projectId/repositories",
  "/projects/:projectId/board",
  "/projects/:projectId/features",
  "/projects/:projectId/features/:featureId",
  "/projects/:projectId/features/:featureId/context",
  "/projects/:projectId/decisions",
  "/projects/:projectId/invariants",
  "/workbench",
  "/workbench/runs",
  "/workbench/runs/new",
  "/workbench/handoffs",
  "/projects/:projectId/runs/:runId",
  "/projects/:projectId/handoffs/:handoffId",
  "/projects/:projectId/delivery/*",
  "*",
];

function workspaceRoutePaths() {
  const routerPath = path.resolve(process.cwd(), "src/app/router.tsx");
  const source = readFileSync(routerPath, "utf8");
  const parsed = ts.createSourceFile(routerPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const workspaceRoutes = parsed.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === "WorkspaceRoutes",
  );
  if (!workspaceRoutes?.body) throw new Error("WorkspaceRoutes was not found in app/router.tsx.");

  const paths: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === "Route") {
      const pathAttribute = node.attributes.properties.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(parsed) === "path",
      );
      if (pathAttribute?.initializer && ts.isStringLiteral(pathAttribute.initializer)) {
        paths.push(pathAttribute.initializer.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(workspaceRoutes.body);
  return paths;
}

describe("application route compatibility", () => {
  it("preserves the baseline route declarations and ordering", () => {
    expect(workspaceRoutePaths()).toEqual(baselinePaths);
  });
});
