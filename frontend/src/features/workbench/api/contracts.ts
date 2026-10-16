export type RunStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "AWAITING_HANDOFF"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AgentRun = {
  id: string;
  project_id: string;
  feature_id: string;
  context_package_id: string;
  context_schema_version: string;
  context_fingerprint: string;
  title: string;
  description: string | null;
  execution_mode: string;
  executor_type: string;
  executor_label: string | null;
  status: RunStatus;
  version: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type RunEvent = {
  id: string;
  run_id: string;
  event_type: string;
  title: string;
  description: string;
  origin: string;
  recorded_at: string;
  occurred_at: string | null;
  supersedes_event_id: string | null;
};

export type RunOutputReference = {
  id: string;
  run_id: string;
  label: string;
  summary: string;
  reference_kind: string;
  reference_value: string | null;
  provenance: string;
  created_at: string;
};

export type HandoffStatus = "DRAFT" | "READY" | "ACKNOWLEDGED" | "WITHDRAWN";

export type HandoffRevision = {
  id: string;
  handoff_id: string;
  revision: number;
  title: string;
  summary: string;
  outcomes: string;
  blockers: string;
  questions: string;
  next_actions: string;
  references: string;
  schema_version: string;
  context_package_id: string;
  context_fingerprint: string;
  fingerprint: string;
  payload: Record<string, unknown>;
  markdown: string;
  created_at: string;
};

export type HandoffAcknowledgement = {
  id: string;
  handoff_id: string;
  revision: number;
  acknowledged_by: string | null;
  acknowledged_at: string;
};

export type Handoff = {
  id: string;
  project_id: string;
  feature_id: string;
  run_id: string;
  context_package_id: string;
  title: string;
  summary: string;
  outcomes: string;
  blockers: string;
  questions: string;
  next_actions: string;
  references: string;
  status: HandoffStatus;
  current_revision: number;
  version: number;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  acknowledged_at: string | null;
  withdrawn_at: string | null;
  published_revision: HandoffRevision | null;
  acknowledgement: HandoffAcknowledgement | null;
  acknowledgements: HandoffAcknowledgement[];
};
