import { downloadFile, request } from "../../../shared/api/client";
import type {
  Project,
  ProjectImportDocument,
  ProjectImportPreview,
  ProjectImportResult,
  ProjectPlanningOverview,
} from "./contracts";

export const projectsApi = {
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
  previewProjectImport: (
    workspaceId: string,
    document: ProjectImportDocument,
    signal?: AbortSignal,
  ) =>
    request<ProjectImportPreview>(`/workspaces/${workspaceId}/projects/import/preview`, {
      method: "POST",
      body: JSON.stringify(document),
      signal,
    }),
  importProject: (
    workspaceId: string,
    document: ProjectImportDocument,
    expectedFingerprint: string,
  ) =>
    request<ProjectImportResult>(`/workspaces/${workspaceId}/projects/import`, {
      method: "POST",
      body: JSON.stringify({ document, expected_fingerprint: expectedFingerprint }),
    }),
  exportProject: (workspaceId: string, projectId: string) =>
    downloadFile(`/api/workspaces/${workspaceId}/projects/${projectId}/export`, "forge-project-import-v1.json"),
};
