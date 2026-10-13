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
  listProjects: (workspaceId: string, search = "", status: "active" | "archived" | "all" = "all") => {
    const query = new URLSearchParams({ status });
    if (search.trim()) query.set("search", search.trim());
    return request<Project[]>(`/workspaces/${workspaceId}/projects?${query.toString()}`);
  },
  getProject: (workspaceId: string, projectId: string) =>
    request<Project>(`/workspaces/${workspaceId}/projects/${projectId}`),
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
};
