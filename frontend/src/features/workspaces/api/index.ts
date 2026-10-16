import { request } from "../../../shared/api/client";
import type { Workspace } from "./contracts";

export const workspacesApi = {
  listWorkspaces: () => request<Workspace[]>("/workspaces"),
  createWorkspace: (payload: { name: string; description?: string }) =>
    request<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(payload) }),
  updateWorkspace: (id: string, payload: { name?: string; description?: string }) =>
    request<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
};
