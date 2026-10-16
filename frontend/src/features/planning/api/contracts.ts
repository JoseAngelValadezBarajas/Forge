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
