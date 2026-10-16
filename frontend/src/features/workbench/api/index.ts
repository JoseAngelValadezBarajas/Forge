import { request } from "../../../shared/api/client";
import type { RunStatus, AgentRun, RunEvent, RunOutputReference, HandoffStatus, HandoffRevision, HandoffAcknowledgement, Handoff } from "./contracts";

export const workbenchApi = {
  listRuns: (workspaceId: string, options: { projectId?: string; featureId?: string; status?: RunStatus; search?: string } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (options.projectId) query.set("project_id", options.projectId);
    if (options.featureId) query.set("feature_id", options.featureId);
    if (options.status) query.set("status", options.status);
    if (options.search?.trim()) query.set("search", options.search.trim());
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<AgentRun[]>(`/workspaces/${workspaceId}/runs${suffix}`, { signal });
  },
  getRun: (workspaceId: string, projectId: string, runId: string, signal?: AbortSignal) =>
    request<AgentRun>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}`, { signal }),
  createRun: (workspaceId: string, projectId: string, payload: { feature_id: string; context_package_id: string; title: string; description?: string; execution_mode?: "manual"; executor_type?: "human" | "external_agent" | "unknown"; executor_label?: string }) =>
    request<AgentRun>(`/workspaces/${workspaceId}/projects/${projectId}/runs`, { method: "POST", body: JSON.stringify(payload) }),
  updateRunStatus: (workspaceId: string, projectId: string, runId: string, status: RunStatus, expectedVersion: number) =>
    request<AgentRun>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/status`, { method: "POST", body: JSON.stringify({ status, expected_version: expectedVersion }) }),
  listRunEvents: (workspaceId: string, projectId: string, runId: string, signal?: AbortSignal) =>
    request<RunEvent[]>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/events`, { signal }),
  addRunEvent: (workspaceId: string, projectId: string, runId: string, payload: { event_type: string; title: string; description: string; expected_version: number; supersedes_event_id?: string }) =>
    request<RunEvent>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/events`, { method: "POST", body: JSON.stringify(payload) }),
  listRunOutputs: (workspaceId: string, projectId: string, runId: string, signal?: AbortSignal) =>
    request<RunOutputReference[]>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/outputs`, { signal }),
  addRunOutput: (workspaceId: string, projectId: string, runId: string, payload: { label: string; summary: string; reference_kind?: string; reference_value?: string; provenance: string; expected_version: number }) =>
    request<RunOutputReference>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/outputs`, { method: "POST", body: JSON.stringify(payload) }),
  listHandoffs: (workspaceId: string, projectId: string, options: { status?: HandoffStatus; search?: string } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (options.status) query.set("status", options.status);
    if (options.search?.trim()) query.set("search", options.search.trim());
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<Handoff[]>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs${suffix}`, { signal });
  },
  getHandoff: (workspaceId: string, projectId: string, handoffId: string, signal?: AbortSignal) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}`, { signal }),
  createHandoff: (workspaceId: string, projectId: string, runId: string, payload: { title: string; summary?: string; outcomes?: string; blockers?: string; questions?: string; next_actions?: string; references?: string }) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/handoffs`, { method: "POST", body: JSON.stringify(payload) }),
  updateHandoff: (workspaceId: string, projectId: string, handoffId: string, payload: { expected_version: number; title?: string; summary?: string; outcomes?: string; blockers?: string; questions?: string; next_actions?: string; references?: string }) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  readyHandoff: (workspaceId: string, projectId: string, handoffId: string, expectedVersion: number) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/ready`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion }) }),
  reviseHandoff: (workspaceId: string, projectId: string, handoffId: string, expectedVersion: number) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/revise`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion }) }),
  acknowledgeHandoff: (workspaceId: string, projectId: string, handoffId: string, expectedRevision: number, acknowledgedBy?: string) =>
    request<HandoffAcknowledgement>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/acknowledge`, { method: "POST", body: JSON.stringify({ expected_revision: expectedRevision, acknowledged_by: acknowledgedBy }) }),
  withdrawHandoff: (workspaceId: string, projectId: string, handoffId: string, expectedVersion: number) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/withdraw`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion }) }),
  listHandoffRevisions: (workspaceId: string, projectId: string, handoffId: string, signal?: AbortSignal) =>
    request<HandoffRevision[]>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/revisions`, { signal }),
};
