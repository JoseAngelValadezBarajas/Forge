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
