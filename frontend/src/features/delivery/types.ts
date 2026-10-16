import type {
  AcceptanceCriterion,
  ContextPackage,
  EvidenceRecord,
  Feature,
  GitObservation,
  Handoff,
  HandoffRevision,
  Project,
  ReleaseCandidate,
  RepositoryConnection,
  VerificationEvaluation,
  VerificationRule,
} from "../../api";

export type Loaded = {
  project: Project;
  features: Feature[];
  criteria: AcceptanceCriterion[];
  packages: ContextPackage[];
  evidence: EvidenceRecord[];
  verifications: VerificationEvaluation[];
  rules: VerificationRule[];
  candidates: ReleaseCandidate[];
  handoffs: Handoff[];
  handoffRevisions: HandoffRevision[];
  observations: {
    repository: RepositoryConnection;
    observation: GitObservation;
  }[];
};
