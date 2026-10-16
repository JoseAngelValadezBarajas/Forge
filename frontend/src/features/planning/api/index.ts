import { request } from "../../../shared/api/client";
import type { EpicStatus, FeaturePriority, FeatureStatus, TaskStatus, Epic, Feature, Task, AcceptanceCriterion, FeatureDependency } from "./contracts";

export const planningApi = {
  listEpics: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<Epic[]>(`/workspaces/${workspaceId}/projects/${projectId}/epics`, { signal }),
  createEpic: (workspaceId: string, projectId: string, payload: { title: string; description?: string }) =>
    request<Epic>(`/workspaces/${workspaceId}/projects/${projectId}/epics`, { method: "POST", body: JSON.stringify(payload) }),
  updateEpic: (workspaceId: string, projectId: string, epicId: string, payload: { title?: string; description?: string; status?: EpicStatus }) =>
    request<Epic>(`/workspaces/${workspaceId}/projects/${projectId}/epics/${epicId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  listFeatures: (
    workspaceId: string,
    projectId: string,
    options: { search?: string; status?: FeatureStatus; priority?: FeaturePriority; epicId?: string } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams();
    if (options.search?.trim()) query.set("search", options.search.trim());
    if (options.status) query.set("status", options.status);
    if (options.priority) query.set("priority", options.priority);
    if (options.epicId) query.set("epic_id", options.epicId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<Feature[]>(`/workspaces/${workspaceId}/projects/${projectId}/features${suffix}`, { signal });
  },
  createFeature: (workspaceId: string, projectId: string, payload: { title: string; description?: string; goal?: string; priority?: FeaturePriority; status?: FeatureStatus; epic_id?: string }) =>
    request<Feature>(`/workspaces/${workspaceId}/projects/${projectId}/features`, { method: "POST", body: JSON.stringify(payload) }),
  getFeature: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<Feature>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}`, { signal }),
  updateFeature: (workspaceId: string, projectId: string, featureId: string, payload: { title?: string; description?: string; goal?: string; priority?: FeaturePriority; status?: FeatureStatus; epic_id?: string; clear_epic?: boolean }) =>
    request<Feature>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  listTasks: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<Task[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/tasks`, { signal }),
  createTask: (workspaceId: string, projectId: string, featureId: string, payload: { title: string; description?: string; status?: TaskStatus; position?: number }) =>
    request<Task>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/tasks`, { method: "POST", body: JSON.stringify(payload) }),
  updateTask: (workspaceId: string, projectId: string, featureId: string, taskId: string, payload: { title?: string; description?: string; status?: TaskStatus; position?: number }) =>
    request<Task>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  reorderTasks: (workspaceId: string, projectId: string, featureId: string, ids: string[]) =>
    request<Task[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/tasks/reorder`, { method: "POST", body: JSON.stringify({ ids }) }),
  listCriteria: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<AcceptanceCriterion[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/acceptance-criteria`, { signal }),
  createCriterion: (workspaceId: string, projectId: string, featureId: string, payload: { description: string; satisfied?: boolean; position?: number }) =>
    request<AcceptanceCriterion>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/acceptance-criteria`, { method: "POST", body: JSON.stringify(payload) }),
  updateCriterion: (workspaceId: string, projectId: string, featureId: string, criterionId: string, payload: { description?: string; satisfied?: boolean; position?: number }) =>
    request<AcceptanceCriterion>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/acceptance-criteria/${criterionId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  reorderCriteria: (workspaceId: string, projectId: string, featureId: string, ids: string[]) =>
    request<AcceptanceCriterion[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/acceptance-criteria/reorder`, { method: "POST", body: JSON.stringify({ ids }) }),
  listDependencies: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<FeatureDependency[]>(`/workspaces/${workspaceId}/projects/${projectId}/dependencies`, { signal }),
  createDependency: (workspaceId: string, projectId: string, payload: { blocking_feature_id: string; blocked_feature_id: string }) =>
    request<FeatureDependency>(`/workspaces/${workspaceId}/projects/${projectId}/dependencies`, { method: "POST", body: JSON.stringify(payload) }),
  deleteDependency: (workspaceId: string, projectId: string, dependencyId: string) =>
    request<void>(`/workspaces/${workspaceId}/projects/${projectId}/dependencies/${dependencyId}`, { method: "DELETE" }),
};
