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

export type DecisionStatus = "proposed" | "accepted" | "superseded";
export type Decision = {
  id: string;
  project_id: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives_considered: string | null;
  tradeoffs: string | null;
  status: DecisionStatus;
  superseded_by_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type DecisionRevision = Decision & { decision_id: string };
export type InvariantStatus = "active" | "retired";
export type Invariant = {
  id: string;
  project_id: string;
  feature_id: string | null;
  title: string;
  statement: string;
  rationale: string;
  status: InvariantStatus;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type ApplicableInvariant = Invariant & {
  acknowledged_revision: number | null;
  acknowledged_at: string | null;
  needs_acknowledgement: boolean;
};

export type InvariantRevision = Invariant & { invariant_id: string };
export type ReadinessReference = { kind: string; id: string; label?: string };
export type ReadinessBlocker = { code: string; message: string; references: ReadinessReference[] };
export type ReadinessRuleResult = {
  rule_id: string;
  rule_version: string;
  result: "passed" | "failed";
  explanation: string;
  blockers: ReadinessBlocker[];
  references: ReadinessReference[];
};
export type ReadinessEvaluation = {
  evaluation_id: string | null;
  feature_id: string;
  evaluated_at: string;
  rule_set_version: string;
  input_fingerprint: string;
  outcome: "READY_TO_START" | "NOT_READY";
  passed_checks: string[];
  failed_checks: string[];
  blockers: ReadinessBlocker[];
  results: ReadinessRuleResult[];
  stale: boolean;
};

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
  listDecisions: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<Decision[]>(`/workspaces/${workspaceId}/projects/${projectId}/decisions`, { signal }),
  createDecision: (workspaceId: string, projectId: string, payload: Omit<DecisionCreatePayload, "status">) =>
    request<Decision>(`/workspaces/${workspaceId}/projects/${projectId}/decisions`, { method: "POST", body: JSON.stringify(payload) }),
  updateDecision: (workspaceId: string, projectId: string, decisionId: string, payload: Partial<DecisionCreatePayload>) =>
    request<Decision>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  acceptDecision: (workspaceId: string, projectId: string, decisionId: string) =>
    request<Decision>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/accept`, { method: "POST" }),
  supersedeDecision: (workspaceId: string, projectId: string, decisionId: string, payload: DecisionCreatePayload) =>
    request<Decision>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/supersede`, { method: "POST", body: JSON.stringify(payload) }),
  listDecisionRevisions: (workspaceId: string, projectId: string, decisionId: string, signal?: AbortSignal) =>
    request<DecisionRevision[]>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/revisions`, { signal }),
  linkDecision: (workspaceId: string, projectId: string, decisionId: string, featureId: string) =>
    request<void>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/features/${featureId}`, { method: "POST" }),
  unlinkDecision: (workspaceId: string, projectId: string, decisionId: string, featureId: string) =>
    request<void>(`/workspaces/${workspaceId}/projects/${projectId}/decisions/${decisionId}/features/${featureId}`, { method: "DELETE" }),
  listFeatureDecisions: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<Decision[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/decisions`, { signal }),
  listInvariants: (workspaceId: string, projectId: string, includeRetired = true, signal?: AbortSignal) =>
    request<Invariant[]>(`/workspaces/${workspaceId}/projects/${projectId}/invariants?include_retired=${includeRetired}`, { signal }),
  createInvariant: (workspaceId: string, projectId: string, payload: InvariantCreatePayload) =>
    request<Invariant>(`/workspaces/${workspaceId}/projects/${projectId}/invariants`, { method: "POST", body: JSON.stringify(payload) }),
  updateInvariant: (workspaceId: string, projectId: string, invariantId: string, payload: Partial<InvariantCreatePayload>) =>
    request<Invariant>(`/workspaces/${workspaceId}/projects/${projectId}/invariants/${invariantId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  retireInvariant: (workspaceId: string, projectId: string, invariantId: string) =>
    request<Invariant>(`/workspaces/${workspaceId}/projects/${projectId}/invariants/${invariantId}/retire`, { method: "POST" }),
  listInvariantRevisions: (workspaceId: string, projectId: string, invariantId: string, signal?: AbortSignal) =>
    request<InvariantRevision[]>(`/workspaces/${workspaceId}/projects/${projectId}/invariants/${invariantId}/revisions`, { signal }),
  listFeatureInvariants: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ApplicableInvariant[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/invariants`, { signal }),
  acknowledgeInvariant: (workspaceId: string, projectId: string, featureId: string, invariantId: string, expectedRevision: number) =>
    request<InvariantAcknowledgement>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/invariants/${invariantId}/acknowledge`, { method: "POST", body: JSON.stringify({ expected_revision: expectedRevision }) }),
  previewReadiness: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ReadinessEvaluation>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/readiness/preview`, { method: "POST", signal }),
  saveReadiness: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ReadinessEvaluation>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/readiness/evaluations`, { method: "POST", signal }),
  listReadinessEvaluations: (workspaceId: string, projectId: string, featureId: string, signal?: AbortSignal) =>
    request<ReadinessEvaluation[]>(`/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/readiness/evaluations`, { signal }),
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
  listRuns: (workspaceId: string, options: { projectId?: string; featureId?: string; status?: RunStatus; search?: string } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (options.projectId) query.set("project_id", options.projectId);
    if (options.featureId) query.set("feature_id", options.featureId);
    if (options.status) query.set("status", options.status);
    if (options.search?.trim()) query.set("search", options.search.trim());
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<AgentRun[]>(`/workspaces/${workspaceId}/runs${suffix}`, { signal });
  },
  getRun: (workspaceId: string, projectId: string, runId: string, signal?: AbortSignal) =>
    request<AgentRun>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}`, { signal }),
  createRun: (workspaceId: string, projectId: string, payload: { feature_id: string; context_package_id: string; title: string; description?: string; execution_mode?: "manual"; executor_type?: "human" | "external_agent" | "unknown"; executor_label?: string }) =>
    request<AgentRun>(`/workspaces/${workspaceId}/projects/${projectId}/runs`, { method: "POST", body: JSON.stringify(payload) }),
  updateRunStatus: (workspaceId: string, projectId: string, runId: string, status: RunStatus, expectedVersion: number) =>
    request<AgentRun>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/status`, { method: "POST", body: JSON.stringify({ status, expected_version: expectedVersion }) }),
  listRunEvents: (workspaceId: string, projectId: string, runId: string, signal?: AbortSignal) =>
    request<RunEvent[]>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/events`, { signal }),
  addRunEvent: (workspaceId: string, projectId: string, runId: string, payload: { event_type: string; title: string; description: string; expected_version: number; supersedes_event_id?: string }) =>
    request<RunEvent>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/events`, { method: "POST", body: JSON.stringify(payload) }),
  listRunOutputs: (workspaceId: string, projectId: string, runId: string, signal?: AbortSignal) =>
    request<RunOutputReference[]>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/outputs`, { signal }),
  addRunOutput: (workspaceId: string, projectId: string, runId: string, payload: { label: string; summary: string; reference_kind?: string; reference_value?: string; provenance: string; expected_version: number }) =>
    request<RunOutputReference>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/outputs`, { method: "POST", body: JSON.stringify(payload) }),
  listHandoffs: (workspaceId: string, projectId: string, options: { status?: HandoffStatus; search?: string } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (options.status) query.set("status", options.status);
    if (options.search?.trim()) query.set("search", options.search.trim());
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<Handoff[]>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs${suffix}`, { signal });
  },
  getHandoff: (workspaceId: string, projectId: string, handoffId: string, signal?: AbortSignal) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}`, { signal }),
  createHandoff: (workspaceId: string, projectId: string, runId: string, payload: { title: string; summary?: string; outcomes?: string; blockers?: string; questions?: string; next_actions?: string; references?: string }) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/runs/${runId}/handoffs`, { method: "POST", body: JSON.stringify(payload) }),
  updateHandoff: (workspaceId: string, projectId: string, handoffId: string, payload: { expected_version: number; title?: string; summary?: string; outcomes?: string; blockers?: string; questions?: string; next_actions?: string; references?: string }) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  readyHandoff: (workspaceId: string, projectId: string, handoffId: string, expectedVersion: number) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/ready`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion }) }),
  reviseHandoff: (workspaceId: string, projectId: string, handoffId: string, expectedVersion: number) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/revise`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion }) }),
  acknowledgeHandoff: (workspaceId: string, projectId: string, handoffId: string, expectedRevision: number, acknowledgedBy?: string) =>
    request<HandoffAcknowledgement>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/acknowledge`, { method: "POST", body: JSON.stringify({ expected_revision: expectedRevision, acknowledged_by: acknowledgedBy }) }),
  withdrawHandoff: (workspaceId: string, projectId: string, handoffId: string, expectedVersion: number) =>
    request<Handoff>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/withdraw`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion }) }),
  listHandoffRevisions: (workspaceId: string, projectId: string, handoffId: string, signal?: AbortSignal) =>
    request<HandoffRevision[]>(`/workspaces/${workspaceId}/projects/${projectId}/handoffs/${handoffId}/revisions`, { signal }),
};

export type DecisionCreatePayload = {
  title: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives_considered?: string;
  tradeoffs?: string;
};

export type InvariantAcknowledgement = {
  id: string;
  feature_id: string;
  invariant_id: string;
  acknowledged_revision: number;
  acknowledged_at: string;
};

export type InvariantCreatePayload = {
  title: string;
  statement: string;
  rationale: string;
  feature_id?: string;
};
