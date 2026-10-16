import { request } from "../../../shared/api/client";
import type { ReadinessEvaluation } from "./contracts";

export const readinessApi = {
  previewReadiness: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ReadinessEvaluation>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/readiness/preview`, { method: "POST", signal }),
  saveReadiness: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ReadinessEvaluation>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/readiness/evaluations`, { method: "POST", signal }),
  listReadinessEvaluations: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ReadinessEvaluation[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/readiness/evaluations`, { signal }),
};
