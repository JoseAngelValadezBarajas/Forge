import { request } from "../../../shared/api/client";
import type { Invariant, ApplicableInvariant, InvariantRevision, InvariantAcknowledgement, InvariantCreatePayload } from "./contracts";

export const invariantsApi = {
  listInvariants: (workspaceId: string, projectId: string, includeRetired = true, signal?: AbortSignal) =>
    request<Invariant[]>(`/workspaces/${workspaceId}/projects/${projectId}/invariants?include_retired=${includeRetired}`, { signal }),
  createInvariant: (workspaceId: string, projectId: string, payload: InvariantCreatePayload) =>
    request<Invariant>(`/workspaces/${workspaceId}/projects/${projectId}/invariants`, { method: "POST", body: JSON.stringify(payload) }),
  updateInvariant: (workspaceId: string, projectId: string, invariantId: string, payload: Partial<InvariantCreatePayload>) =>
    request<Invariant>(`/workspaces/${workspaceId}/projects/${projectId}/invariants/${invariantId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  retireInvariant: (workspaceId: string, projectId: string, invariantId: string) =>
    request<Invariant>(`/workspaces/${workspaceId}/projects/${projectId}/invariants/${invariantId}/retire`, { method: "POST" }),
  listInvariantRevisions: (workspaceId: string, projectId: string, invariantId: string, signal?: AbortSignal) =>
    request<InvariantRevision[]>(`/workspaces/${workspaceId}/projects/${projectId}/invariants/${invariantId}/revisions`, { signal }),
  listFeatureInvariants: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ApplicableInvariant[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/invariants`, { signal }),
  acknowledgeInvariant: (workspaceId: string, projectId: string, featureId: string, invariantId: string, expectedRevision: number) =>
    request<InvariantAcknowledgement>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/invariants/${invariantId}/acknowledge`, { method: "POST", body: JSON.stringify({ expected_revision: expectedRevision }) }),
};
