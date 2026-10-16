export type RepositoryConnection = {
  id: string;
  project_id: string;
  root_path: string;
  status: "connected" | "disconnected";
  connected_at: string;
  disconnected_at: string | null;
  last_observed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GitObservation = {
  id: string;
  repository_id: string;
  observed_at: string;
  head_sha: string | null;
  branch: string | null;
  detached: boolean;
  unborn: boolean;
  clean: boolean | null;
  tracked_modified_count: number;
  staged_count: number;
  untracked_count: number;
  observer_version: string;
  status: string;
  error_code: string | null;
  error_detail: string | null;
};

export type FeatureRepositoryLink = {
  id: string;
  feature_id: string;
  repository_id: string;
  created_at: string;
};

export type ContextPackage = {
  id: string | null;
  project_id: string;
  feature_id: string;
  schema_version: string;
  fingerprint: string;
  created_at: string | null;
  payload: Record<string, unknown>;
  markdown: string;
};
