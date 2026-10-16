import { forgeApi } from "./api";
import { characterizeApiContracts, jsonBody, signal } from "./test/api-contract-harness";

const decision = { title: "Local storage", context: "Offline use", decision: "SQLite", rationale: "Portable" };

characterizeApiContracts("decisionsInvariantsReadiness", [
  { name: "listDecisions forwards cancellation", invoke: () => forgeApi.listDecisions("w1", "p1", signal), url: "/api/workspaces/w1/projects/p1/decisions", signal },
  { name: "createDecision posts the decision fields", invoke: () => forgeApi.createDecision("w1", "p1", decision), url: "/api/workspaces/w1/projects/p1/decisions", method: "POST", body: jsonBody(decision) },
  { name: "updateDecision patches only supplied revision content", invoke: () => forgeApi.updateDecision("w1", "p1", "d1", { rationale: "Updated rationale" }), url: "/api/workspaces/w1/projects/p1/decisions/d1", method: "PATCH", body: jsonBody({ rationale: "Updated rationale" }) },
  { name: "acceptDecision posts without a body", invoke: () => forgeApi.acceptDecision("w1", "p1", "d1"), url: "/api/workspaces/w1/projects/p1/decisions/d1/accept", method: "POST" },
  { name: "supersedeDecision posts the successor decision", invoke: () => forgeApi.supersedeDecision("w1", "p1", "d1", decision), url: "/api/workspaces/w1/projects/p1/decisions/d1/supersede", method: "POST", body: jsonBody(decision) },
  { name: "listDecisionRevisions forwards cancellation", invoke: () => forgeApi.listDecisionRevisions("w1", "p1", "d1", signal), url: "/api/workspaces/w1/projects/p1/decisions/d1/revisions", signal },
  { name: "linkDecision posts to the feature link resource", invoke: () => forgeApi.linkDecision("w1", "p1", "d1", "f1"), url: "/api/workspaces/w1/projects/p1/decisions/d1/features/f1", method: "POST" },
  { name: "unlinkDecision deletes the feature link resource", invoke: () => forgeApi.unlinkDecision("w1", "p1", "d1", "f1"), url: "/api/workspaces/w1/projects/p1/decisions/d1/features/f1", method: "DELETE" },
  { name: "listFeatureDecisions forwards cancellation", invoke: () => forgeApi.listFeatureDecisions("w1", "p1", "f1", signal), url: "/api/workspaces/w1/projects/p1/features/f1/decisions", signal },
  { name: "listInvariants serializes include_retired true by default", invoke: () => forgeApi.listInvariants("w1", "p1", undefined, signal), url: "/api/workspaces/w1/projects/p1/invariants?include_retired=true", signal },
  { name: "listInvariants serializes include_retired false", invoke: () => forgeApi.listInvariants("w1", "p1", false), url: "/api/workspaces/w1/projects/p1/invariants?include_retired=false" },
  { name: "createInvariant serializes its scope and content", invoke: () => forgeApi.createInvariant("w1", "p1", { title: "No false evidence", statement: "Only observed checks are verified.", rationale: "Protect trust.", feature_id: "f1" }), url: "/api/workspaces/w1/projects/p1/invariants", method: "POST", body: jsonBody({ title: "No false evidence", statement: "Only observed checks are verified.", rationale: "Protect trust.", feature_id: "f1" }) },
  { name: "updateInvariant patches the selected invariant", invoke: () => forgeApi.updateInvariant("w1", "p1", "i1", { rationale: "Clarified" }), url: "/api/workspaces/w1/projects/p1/invariants/i1", method: "PATCH", body: jsonBody({ rationale: "Clarified" }) },
  { name: "retireInvariant posts without a body", invoke: () => forgeApi.retireInvariant("w1", "p1", "i1"), url: "/api/workspaces/w1/projects/p1/invariants/i1/retire", method: "POST" },
  { name: "listInvariantRevisions forwards cancellation", invoke: () => forgeApi.listInvariantRevisions("w1", "p1", "i1", signal), url: "/api/workspaces/w1/projects/p1/invariants/i1/revisions", signal },
  { name: "listFeatureInvariants forwards cancellation", invoke: () => forgeApi.listFeatureInvariants("w1", "p1", "f1", signal), url: "/api/workspaces/w1/projects/p1/features/f1/invariants", signal },
  { name: "acknowledgeInvariant includes the expected revision", invoke: () => forgeApi.acknowledgeInvariant("w1", "p1", "f1", "i1", 4), url: "/api/workspaces/w1/projects/p1/features/f1/invariants/i1/acknowledge", method: "POST", body: jsonBody({ expected_revision: 4 }) },
  { name: "previewReadiness posts and forwards cancellation", invoke: () => forgeApi.previewReadiness("w1", "p1", "f1", signal), url: "/api/workspaces/w1/projects/p1/features/f1/readiness/preview", method: "POST", signal },
  { name: "saveReadiness posts an evaluation and forwards cancellation", invoke: () => forgeApi.saveReadiness("w1", "p1", "f1", signal), url: "/api/workspaces/w1/projects/p1/features/f1/readiness/evaluations", method: "POST", signal },
  { name: "listReadinessEvaluations forwards cancellation", invoke: () => forgeApi.listReadinessEvaluations("w1", "p1", "f1", signal), url: "/api/workspaces/w1/projects/p1/features/f1/readiness/evaluations", signal },
]);
