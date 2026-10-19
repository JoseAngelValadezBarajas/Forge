import { forgeApi } from "./api";
import { characterizeApiContracts, jsonBody, signal } from "./test/api-contract-harness";

characterizeApiContracts("workspacesProjects", [
  { name: "listWorkspaces uses GET and parses its JSON response", invoke: () => forgeApi.listWorkspaces(), url: "/api/workspaces" },
  { name: "createWorkspace posts only supplied fields", invoke: () => forgeApi.createWorkspace({ name: "Research" }), url: "/api/workspaces", method: "POST", body: jsonBody({ name: "Research" }) },
  { name: "updateWorkspace patches the selected workspace", invoke: () => forgeApi.updateWorkspace("w1", { description: "Local" }), url: "/api/workspaces/w1", method: "PATCH", body: jsonBody({ description: "Local" }) },
  { name: "listProjects trims and URL-encodes search while preserving status ordering", invoke: () => forgeApi.listProjects("w1", "  Forge & UX  ", "active", signal), url: "/api/workspaces/w1/projects?status=active&search=Forge+%26+UX", signal },
  { name: "listProjects defaults to all projects and omits blank search", invoke: () => forgeApi.listProjects("w1"), url: "/api/workspaces/w1/projects?status=all" },
  { name: "getProject forwards its AbortSignal and preserves path interpolation", invoke: () => forgeApi.getProject("workspace one", "project#two", signal), url: "/api/workspaces/workspace one/projects/project#two", signal },
  { name: "createProject serializes the request DTO", invoke: () => forgeApi.createProject("w1", { name: "Forge", description: "Local-first" }), url: "/api/workspaces/w1/projects", method: "POST", body: jsonBody({ name: "Forge", description: "Local-first" }) },
  { name: "updateProject preserves omitted optional fields", invoke: () => forgeApi.updateProject("w1", "p1", { name: "Renamed", description: undefined }), url: "/api/workspaces/w1/projects/p1", method: "PATCH", body: jsonBody({ name: "Renamed" }) },
  { name: "updateProject preserves explicit null rather than omitting it", invoke: () => forgeApi.updateProject("w1", "p1", { description: null as never }), url: "/api/workspaces/w1/projects/p1", method: "PATCH", body: jsonBody({ description: null }) },
  { name: "archiveProject posts without a body", invoke: () => forgeApi.archiveProject("w1", "p1"), url: "/api/workspaces/w1/projects/p1/archive", method: "POST" },
  { name: "restoreProject posts without a body", invoke: () => forgeApi.restoreProject("w1", "p1"), url: "/api/workspaces/w1/projects/p1/restore", method: "POST" },
  { name: "getPlanningOverview forwards cancellation", invoke: () => forgeApi.getPlanningOverview("w1", "p1", signal), url: "/api/workspaces/w1/projects/p1/planning/overview", signal },
  { name: "previewProjectImport sends the versioned document and signal", invoke: () => forgeApi.previewProjectImport("w1", { schema_version: "forge-project-import-v1", project: { name: "Imported" }, epics: [], features: [], dependencies: [] }, signal), url: "/api/workspaces/w1/projects/import/preview", method: "POST", body: jsonBody({ schema_version: "forge-project-import-v1", project: { name: "Imported" }, epics: [], features: [], dependencies: [] }), signal },
  { name: "importProject sends the reviewed fingerprint", invoke: () => forgeApi.importProject("w1", { schema_version: "forge-project-import-v1", project: { name: "Imported" }, epics: [], features: [], dependencies: [] }, "a".repeat(64)), url: "/api/workspaces/w1/projects/import", method: "POST", body: jsonBody({ document: { schema_version: "forge-project-import-v1", project: { name: "Imported" }, epics: [], features: [], dependencies: [] }, expected_fingerprint: "a".repeat(64) }) },
  { name: "exportProject uses the authorized download transport", invoke: () => forgeApi.exportProject("w1", "p1"), url: "/api/workspaces/w1/projects/p1/export", download: true },
]);
