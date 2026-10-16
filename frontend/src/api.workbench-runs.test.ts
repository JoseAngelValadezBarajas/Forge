import { forgeApi } from "./api";
import { characterizeApiContracts, jsonBody, signal } from "./test/api-contract-harness";

characterizeApiContracts("workbenchRuns", [
  { name: "listRuns serializes filters and forwards cancellation", invoke: () => forgeApi.listRuns("w1", { projectId: "p1", featureId: "f1", status: "IN_PROGRESS", search: "  fix & test " }, signal), url: "/api/workspaces/w1/runs?project_id=p1&feature_id=f1&status=IN_PROGRESS&search=fix+%26+test", signal },
  { name: "listRuns omits a query suffix when filters are absent", invoke: () => forgeApi.listRuns("w1"), url: "/api/workspaces/w1/runs" },
  { name: "getRun forwards cancellation", invoke: () => forgeApi.getRun("w1", "p1", "run1", signal), url: "/api/workspaces/w1/projects/p1/runs/run1", signal },
  { name: "createRun serializes its execution metadata", invoke: () => forgeApi.createRun("w1", "p1", { feature_id: "f1", context_package_id: "cp1", title: "Implement search", executor_type: "human" }), url: "/api/workspaces/w1/projects/p1/runs", method: "POST", body: jsonBody({ feature_id: "f1", context_package_id: "cp1", title: "Implement search", executor_type: "human" }) },
  { name: "updateRunStatus serializes expected_version", invoke: () => forgeApi.updateRunStatus("w1", "p1", "run1", "COMPLETED", 7), url: "/api/workspaces/w1/projects/p1/runs/run1/status", method: "POST", body: jsonBody({ status: "COMPLETED", expected_version: 7 }) },
  { name: "listRunEvents forwards cancellation", invoke: () => forgeApi.listRunEvents("w1", "p1", "run1", signal), url: "/api/workspaces/w1/projects/p1/runs/run1/events", signal },
  { name: "addRunEvent posts event data and expected version", invoke: () => forgeApi.addRunEvent("w1", "p1", "run1", { event_type: "progress", title: "Started", description: "Work began", expected_version: 2 }), url: "/api/workspaces/w1/projects/p1/runs/run1/events", method: "POST", body: jsonBody({ event_type: "progress", title: "Started", description: "Work began", expected_version: 2 }) },
  { name: "listRunOutputs forwards cancellation", invoke: () => forgeApi.listRunOutputs("w1", "p1", "run1", signal), url: "/api/workspaces/w1/projects/p1/runs/run1/outputs", signal },
  { name: "addRunOutput posts declared provenance", invoke: () => forgeApi.addRunOutput("w1", "p1", "run1", { label: "Patch", summary: "Updated files", provenance: "reported", expected_version: 3 }), url: "/api/workspaces/w1/projects/p1/runs/run1/outputs", method: "POST", body: jsonBody({ label: "Patch", summary: "Updated files", provenance: "reported", expected_version: 3 }) },
]);
