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

export type ProjectPlanningOverview = {
  epics: number;
  features: number;
  tasks: number;
  acceptance_criteria: number;
  satisfied_criteria: number;
  dependencies: number;
};

export type ProjectImportDocument = {
  schema_version: "forge-project-import-v1";
  project: { name: string; description?: string | null };
  epics?: Array<{
    ref: string;
    title: string;
    description?: string | null;
    status?: "planning" | "archived";
  }>;
  features?: Array<{
    ref: string;
    title: string;
    description?: string | null;
    goal?: string | null;
    priority?: "low" | "medium" | "high" | "critical";
    status?: "backlog" | "refining" | "ready" | "in_progress" | "verify" | "done";
    epic_ref?: string | null;
    tasks?: Array<{
      ref: string;
      title: string;
      description?: string | null;
      status?: "todo" | "in_progress" | "done";
      position?: number | null;
    }>;
    acceptance_criteria?: Array<{
      ref: string;
      description: string;
      satisfied?: boolean;
      position?: number | null;
    }>;
  }>;
  dependencies?: Array<{
    blocking_feature_ref: string;
    blocked_feature_ref: string;
  }>;
};

export type ProjectImportCounts = {
  epics: number;
  features: number;
  tasks: number;
  acceptance_criteria: number;
  dependencies: number;
};

export type ProjectImportPreview = {
  schema_version: "forge-project-import-v1";
  workspace_id: string;
  fingerprint: string;
  project_name_conflict: boolean;
  document: ProjectImportDocument;
  counts: ProjectImportCounts;
};

export type ProjectImportResult = {
  schema_version: "forge-project-import-v1";
  workspace_id: string;
  fingerprint: string;
  project_id: string;
  references: Array<{ ref: string; generated_id: string; parent_ref?: string | null }>;
  counts: ProjectImportCounts;
};
