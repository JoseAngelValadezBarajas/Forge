import { forgeApi } from "./api";
import { characterizeApiContracts, jsonBody, signal } from "./test/api-contract-harness";

characterizeApiContracts("repositories", [
  { name: "listRepositories forwards cancellation", invoke: () => forgeApi.listRepositories("w1", "p1", signal), url: "/api/workspaces/w1/projects/p1/repositories", signal },
  { name: "connectRepository serializes root_path", invoke: () => forgeApi.connectRepository("w1", "p1", "C:\\work\\forge"), url: "/api/workspaces/w1/projects/p1/repositories", method: "POST", body: jsonBody({ root_path: "C:\\work\\forge" }) },
  { name: "observeRepository posts and forwards cancellation", invoke: () => forgeApi.observeRepository("w1", "p1", "r1", signal), url: "/api/workspaces/w1/projects/p1/repositories/r1/observe", method: "POST", signal },
  { name: "listObservations forwards cancellation", invoke: () => forgeApi.listObservations("w1", "p1", "r1", signal), url: "/api/workspaces/w1/projects/p1/repositories/r1/observations", signal },
  { name: "disconnectRepository posts without a body", invoke: () => forgeApi.disconnectRepository("w1", "p1", "r1"), url: "/api/workspaces/w1/projects/p1/repositories/r1/disconnect", method: "POST" },
  { name: "listFeatureRepositories forwards cancellation", invoke: () => forgeApi.listFeatureRepositories("w1", "p1", "f1", signal), url: "/api/workspaces/w1/projects/p1/features/f1/repositories", signal },
  { name: "linkFeatureRepository serializes repository_id", invoke: () => forgeApi.linkFeatureRepository("w1", "p1", "f1", "r1"), url: "/api/workspaces/w1/projects/p1/features/f1/repositories", method: "POST", body: jsonBody({ repository_id: "r1" }) },
  { name: "unlinkFeatureRepository deletes the selected link", invoke: () => forgeApi.unlinkFeatureRepository("w1", "p1", "f1", "r1"), url: "/api/workspaces/w1/projects/p1/features/f1/repositories/r1", method: "DELETE" },
  { name: "previewContextPackage posts and forwards cancellation", invoke: () => forgeApi.previewContextPackage("w1", "p1", "f1", signal), url: "/api/workspaces/w1/projects/p1/features/f1/context/preview", method: "POST", signal },
  { name: "listContextPackages forwards cancellation", invoke: () => forgeApi.listContextPackages("w1", "p1", "f1", signal), url: "/api/workspaces/w1/projects/p1/features/f1/context/packages", signal },
  { name: "saveContextPackage posts without a body", invoke: () => forgeApi.saveContextPackage("w1", "p1", "f1"), url: "/api/workspaces/w1/projects/p1/features/f1/context/packages", method: "POST" },
]);
