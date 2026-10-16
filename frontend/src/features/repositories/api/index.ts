import { request } from "../../../shared/api/client";
import type { RepositoryConnection, GitObservation, FeatureRepositoryLink, ContextPackage } from "./contracts";

export const repositoriesApi = {
  listRepositories: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<RepositoryConnection[]>(`/workspaces/${workspaceId}/projects/${projectId}/repositories`, { signal }),
  connectRepository: (workspaceId: string, projectId: string, rootPath: string) =>
    request<RepositoryConnection>(`/workspaces/${workspaceId}/projects/${projectId}/repositories`, { method: "POST", body: JSON.stringify({ root_path: rootPath }) }),
  observeRepository: (workspaceId: string, projectId: string, repositoryId: string, signal?: AbortSignal) =>
    request<GitObservation>(`/workspaces/${workspaceId}/projects/${projectId}/repositories/${repositoryId}/observe`, { method: "POST", signal }),
  listObservations: (workspaceId: string, projectId: string, repositoryId: string, signal?: AbortSignal) =>
    request<GitObservation[]>(`/workspaces/${workspaceId}/projects/${projectId}/repositories/${repositoryId}/observations`, { signal }),
  disconnectRepository: (workspaceId: string, projectId: string, repositoryId: string) =>
    request<RepositoryConnection>(`/workspaces/${workspaceId}/projects/${projectId}/repositories/${repositoryId}/disconnect`, { method: "POST" }),
  listFeatureRepositories: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<RepositoryConnection[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/repositories`, { signal }),
  linkFeatureRepository: (workspaceId: string, projectId: string, featureId: string, repositoryId: string) =>
    request<FeatureRepositoryLink>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/repositories`, { method: "POST", body: JSON.stringify({ repository_id: repositoryId }) }),
  unlinkFeatureRepository: (workspaceId: string, projectId: string, featureId: string, repositoryId: string) =>
    request<void>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/repositories/${repositoryId}`, { method: "DELETE" }),
  previewContextPackage: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ContextPackage>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/context/preview`, { method: "POST", signal }),
  listContextPackages: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ContextPackage[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/context/packages`, { signal }),
  saveContextPackage: (workspaceId: string, projectId: string, featureId: string) =>
    request<ContextPackage>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/context/packages`, { method: "POST" }),
};
