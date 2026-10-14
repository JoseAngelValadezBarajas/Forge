export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectStatus = "active" | "archived";

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type EpicStatus = "planning" | "archived";
export type FeaturePriority = "low" | "medium" | "high" | "critical";
export type FeatureStatus = "backlog" | "refining" | "ready" | "in_progress" | "verify" | "done";
export type TaskStatus = "todo" | "in_progress" | "done";

export type Epic = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: EpicStatus;
  created_at: string;
  updated_at: string;
};

export type Feature = {
  id: string;
  key: string;
  readable_id: string;
  project_id: string;
  epic_id: string | null;
  title: string;
  description: string | null;
  goal: string | null;
  priority: FeaturePriority;
  status: FeatureStatus;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  feature_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  position: number;
  created_at: string;
  updated_at: string;
};

export type AcceptanceCriterion = {
  id: string;
  feature_id: string;
  description: string;
  satisfied: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type FeatureDependency = {
  id: string;
  project_id: string;
  blocking_feature_id: string;
  blocked_feature_id: string;
  created_at: string;
  updated_at: string;
};

export type ProjectPlanningOverview = {
  epics: number;
  features: number;
  tasks: number;
  acceptance_criteria: number;
  satisfied_criteria: number;
  dependencies: number;
};

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    let detail = "Forge could not complete that request.";
    try {
      const payload = (await response.json()) as { detail?: string | { msg?: string }[] };
      if (typeof payload.detail === "string") detail = payload.detail;
      else if (Array.isArray(payload.detail)) detail = payload.detail.map((item) => item.msg).join("; ");
    } catch {
      // Preserve a stable user-facing error when the server did not return JSON.
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const forgeApi = {
  listWorkspaces: () => request<Workspace[]>("/workspaces"),
  createWorkspace: (payload: { name: string; description?: string }) =>
    request<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(payload) }),
  updateWorkspace: (id: string, payload: { name?: string; description?: string }) =>
    request<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  listProjects: (
    workspaceId: string,
    search = "",
    status: "active" | "archived" | "all" = "all",
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({ status });
    if (search.trim()) query.set("search", search.trim());
    return request<Project[]>(`/workspaces/${workspaceId}/projects?${query.toString()}`, { signal });
  },
  getProject: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<Project>(`/workspaces/${workspaceId}/projects/${projectId}`, { signal }),
  createProject: (workspaceId: string, payload: { name: string; description?: string }) =>
    request<Project>(`/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProject: (workspaceId: string, projectId: string, payload: { name?: string; description?: string }) =>
    request<Project>(`/workspaces/${workspaceId}/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  archiveProject: (workspaceId: string, projectId: string) =>
    request<Project>(`/workspaces/${workspaceId}/projects/${projectId}/archive`, { method: "POST" }),
  restoreProject: (workspaceId: string, projectId: string) =>
    request<Project>(`/workspaces/${workspaceId}/projects/${projectId}/restore`, { method: "POST" }),
  getPlanningOverview: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<ProjectPlanningOverview>(`/workspaces/${workspaceId}/projects/${projectId}/planning/overview`, { signal }),
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
