import { forgeApi } from "./api";
import { characterizeApiContracts, jsonBody, signal } from "./test/api-contract-harness";

characterizeApiContracts("workbenchHandoffs", [
  { name: "listHandoffs serializes status and encoded search", invoke: () => forgeApi.listHandoffs("w1", "p1", { status: "READY", search: "  next & owner " }, signal), url: "/api/workspaces/w1/projects/p1/handoffs?status=READY&search=next+%26+owner", signal },
  { name: "listHandoffs omits an empty query suffix by default", invoke: () => forgeApi.listHandoffs("w1", "p1"), url: "/api/workspaces/w1/projects/p1/handoffs" },
  { name: "getHandoff forwards cancellation", invoke: () => forgeApi.getHandoff("w1", "p1", "h1", signal), url: "/api/workspaces/w1/projects/p1/handoffs/h1", signal },
  { name: "createHandoff serializes only supplied draft fields", invoke: () => forgeApi.createHandoff("w1", "p1", "run1", { title: "Review next" }), url: "/api/workspaces/w1/projects/p1/runs/run1/handoffs", method: "POST", body: jsonBody({ title: "Review next" }) },
  { name: "updateHandoff includes expected_version", invoke: () => forgeApi.updateHandoff("w1", "p1", "h1", { expected_version: 5, summary: "Ready for review" }), url: "/api/workspaces/w1/projects/p1/handoffs/h1", method: "PATCH", body: jsonBody({ expected_version: 5, summary: "Ready for review" }) },
  { name: "readyHandoff posts the expected version", invoke: () => forgeApi.readyHandoff("w1", "p1", "h1", 5), url: "/api/workspaces/w1/projects/p1/handoffs/h1/ready", method: "POST", body: jsonBody({ expected_version: 5 }) },
  { name: "reviseHandoff posts the expected version", invoke: () => forgeApi.reviseHandoff("w1", "p1", "h1", 6), url: "/api/workspaces/w1/projects/p1/handoffs/h1/revise", method: "POST", body: jsonBody({ expected_version: 6 }) },
  { name: "acknowledgeHandoff omits undefined acknowledged_by", invoke: () => forgeApi.acknowledgeHandoff("w1", "p1", "h1", 3), url: "/api/workspaces/w1/projects/p1/handoffs/h1/acknowledge", method: "POST", body: jsonBody({ expected_revision: 3 }) },
  { name: "acknowledgeHandoff includes the reviewer when provided", invoke: () => forgeApi.acknowledgeHandoff("w1", "p1", "h1", 3, "reviewer"), url: "/api/workspaces/w1/projects/p1/handoffs/h1/acknowledge", method: "POST", body: jsonBody({ expected_revision: 3, acknowledged_by: "reviewer" }) },
  { name: "withdrawHandoff posts the expected version", invoke: () => forgeApi.withdrawHandoff("w1", "p1", "h1", 8), url: "/api/workspaces/w1/projects/p1/handoffs/h1/withdraw", method: "POST", body: jsonBody({ expected_version: 8 }) },
  { name: "listHandoffRevisions forwards cancellation", invoke: () => forgeApi.listHandoffRevisions("w1", "p1", "h1", signal), url: "/api/workspaces/w1/projects/p1/handoffs/h1/revisions", signal },
]);
