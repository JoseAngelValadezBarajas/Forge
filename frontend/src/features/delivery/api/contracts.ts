export type EvidenceRecord = {
  id: string; project_id: string; feature_id: string | null; acceptance_criterion_id: string | null;
  run_id: string | null; handoff_revision_id: string | null; context_package_id: string | null;
  git_observation_id: string | null; evidence_type: string; title: string; description: string;
  source_kind: string; source_reference: string | null; provenance: "REPORTED" | "OBSERVED" | "VERIFIED" | "UNKNOWN";
  declared_outcome: string | null; status: "ACTIVE" | "INVALIDATED" | "SUPERSEDED";
  version: number; recorded_at: string; invalidated_at: string | null;
};

export type VerificationRule = { rule_id: string; version: string; title: string; available: boolean; required_inputs: string[]; limitation: string };

export type VerificationEvaluation = {
  id: string | null; project_id?: string | null; feature_id: string | null; rule_id: string; rule_version: string;
  subject: Record<string, unknown>; inputs: Record<string, unknown>; input_fingerprint: string;
  result: "PASS" | "FAIL" | "BLOCKED" | "NOT_EVALUATED" | "ERROR"; findings: string[]; limitations: string[];
  evidence_ids: string[]; verifier_version: string; evaluated_at: string | null; stale: boolean;
};

export type ReleaseSelection = { feature_ids: string[]; context_package_ids: string[]; evidence_ids: string[]; verification_ids: string[]; handoff_revision_ids: string[] };

export type ReleaseCandidateInput = { title: string; intended_version?: string; description: string; feature_ids: string[]; context_package_ids: string[]; evidence_ids: string[]; verification_ids: string[]; handoff_revision_ids: string[] };

export type ReleaseCandidate = {
  id: string; project_id: string; candidate_key: string; title: string; intended_version: string | null; description: string;
  status: "DRAFT" | "FROZEN"; schema_version: string; revision: number; content_fingerprint: string;
  selection: ReleaseSelection; snapshot: Record<string, unknown> | null; created_at: string; updated_at: string; frozen_at: string | null;
};

export type GateCheck = { rule_id: string; version: string; status: "PASS" | "BLOCKED" | "STALE"; explanation: string; inputs: string[]; blockers: string[]; limitations: string[] };

export type GateEvaluation = {
  id: string | null; project_id?: string | null; candidate_id: string; candidate_revision?: number; ruleset_version: string;
  input_fingerprint: string; result: "READY_BY_DEFINED_GATES" | "BLOCKED" | "STALE"; stored_result?: string;
  checks: GateCheck[]; limitations: string[]; manifest: Record<string, unknown>; manifest_fingerprint: string; evaluated_at: string | null; stale: boolean;
};

export type ReleaseManifest = { id: string; project_id: string; candidate_id: string; gate_evaluation_id: string; schema_version: string; fingerprint: string; payload: Record<string, unknown>; markdown: string; created_at: string };
