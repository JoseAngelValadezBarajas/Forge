import { workspacesApi } from "./features/workspaces/api";
import { projectsApi } from "./features/projects/api";
import { planningApi } from "./features/planning/api";
import { decisionsApi } from "./features/decisions/api";
import { invariantsApi } from "./features/invariants/api";
import { readinessApi } from "./features/readiness/api";
import { repositoriesApi } from "./features/repositories/api";
import { workbenchApi } from "./features/workbench/api";
import { deliveryApi } from "./features/delivery/api";

export type { Workspace } from "./features/workspaces/api/contracts";
export type { ProjectStatus, Project, ProjectPlanningOverview } from "./features/projects/api/contracts";
export type {
  EpicStatus,
  FeaturePriority,
  FeatureStatus,
  TaskStatus,
  Epic,
  Feature,
  Task,
  AcceptanceCriterion,
  FeatureDependency,
} from "./features/planning/api/contracts";
export type { DecisionStatus, Decision, DecisionRevision, DecisionCreatePayload } from "./features/decisions/api/contracts";
export type {
  InvariantStatus,
  Invariant,
  ApplicableInvariant,
  InvariantRevision,
  InvariantAcknowledgement,
  InvariantCreatePayload,
} from "./features/invariants/api/contracts";
export type {
  ReadinessReference,
  ReadinessBlocker,
  ReadinessRuleResult,
  ReadinessEvaluation,
} from "./features/readiness/api/contracts";
export type {
  RepositoryConnection,
  GitObservation,
  FeatureRepositoryLink,
  ContextPackage,
} from "./features/repositories/api/contracts";
export type {
  RunStatus,
  RunEventType,
  AgentRun,
  RunEvent,
  RunOutputReference,
  HandoffStatus,
  HandoffRevision,
  HandoffAcknowledgement,
  Handoff,
} from "./features/workbench/api/contracts";
export type {
  EvidenceRecord,
  VerificationRule,
  VerificationEvaluation,
  ReleaseSelection,
  ReleaseCandidateInput,
  ReleaseCandidate,
  GateCheck,
  GateEvaluation,
  ReleaseManifest,
} from "./features/delivery/api/contracts";
export { ApiError } from "./shared/api/errors";

export const forgeApi = {
  ...workspacesApi,
  ...projectsApi,
  ...planningApi,
  ...decisionsApi,
  ...invariantsApi,
  ...readinessApi,
  ...repositoriesApi,
  ...workbenchApi,
  ...deliveryApi,
};
