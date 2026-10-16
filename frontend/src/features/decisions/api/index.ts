import { request } from "../../../shared/api/client";
import type { Decision, DecisionRevision, DecisionCreatePayload } from "./contracts";

export const decisionsApi = {
  listDecisions: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<Decision[]>(`/workspaces/${workspaceId}/projects/${projectId}/decisions`, { signal }),
  createDecision: (workspaceId: string, projectId: string, payload: Omit<DecisionCreatePayload, "status">) =>
    request<Decision>(`/workspaces/${workspaceId}/projects/${projectId}/decisions`, { method: "POST", body: JSON.stringify(payload) }),
  updateDecision: (workspaceId: string, projectId: string, decisionId: string, payload: Partial<DecisionCreatePayload>) =>
    request<Decision>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  acceptDecision: (workspaceId: string, projectId: string, decisionId: string) =>
    request<Decision>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/accept`, { method: "POST" }),
  supersedeDecision: (workspaceId: string, projectId: string, decisionId: string, payload: DecisionCreatePayload) =>
    request<Decision>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/supersede`, { method: "POST", body: JSON.stringify(payload) }),
  listDecisionRevisions: (workspaceId: string, projectId: string, decisionId: string, signal?: AbortSignal) =>
    request<DecisionRevision[]>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/revisions`, { signal }),
  linkDecision: (workspaceId: string, projectId: string, decisionId: string, featureId: string) =>
    request<void>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/features/${featureId}`, { method: "POST" }),
  unlinkDecision: (workspaceId: string, projectId: string, decisionId: string, featureId: string) =>
    request<void>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/features/${featureId}`, { method: "DELETE" }),
  listFeatureDecisions: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<Decision[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/decisions`, { signal }),
};
