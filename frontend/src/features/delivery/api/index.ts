import { request } from "../../../shared/api/client";
import type { EvidenceCreatePayload, EvidenceRecord, VerificationRequestPayload, VerificationRule, VerificationEvaluation, ReleaseCandidateInput, ReleaseCandidate, GateEvaluation, ReleaseManifest } from "./contracts";

export const deliveryApi = {
  listEvidence: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<EvidenceRecord[]>(`/workspaces/${workspaceId}/projects/${projectId}/evidence`, { signal }),
  getEvidence: (workspaceId: string, projectId: string, evidenceId: string, signal?: AbortSignal) =>
    request<EvidenceRecord>(`/workspaces/${workspaceId}/projects/${projectId}/evidence/${evidenceId}`, { signal }),
  createEvidence: (workspaceId: string, projectId: string, payload: EvidenceCreatePayload) =>
    request<EvidenceRecord>(`/workspaces/${workspaceId}/projects/${projectId}/evidence`, { method: "POST", body: JSON.stringify(payload) }),
  invalidateEvidence: (workspaceId: string, projectId: string, evidenceId: string) =>
    request<EvidenceRecord>(`/workspaces/${workspaceId}/projects/${projectId}/evidence/${evidenceId}/invalidate`, { method: "POST" }),
  listVerificationRules: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<VerificationRule[]>(`/workspaces/${workspaceId}/projects/${projectId}/verifications/rules`, { signal }),
  listVerifications: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<VerificationEvaluation[]>(`/workspaces/${workspaceId}/projects/${projectId}/verifications`, { signal }),
  previewVerification: (workspaceId: string, projectId: string, payload: VerificationRequestPayload, signal?: AbortSignal) =>
    request<VerificationEvaluation>(`/workspaces/${workspaceId}/projects/${projectId}/verifications/preview`, { method: "POST", body: JSON.stringify(payload), signal }),
  evaluateVerification: (workspaceId: string, projectId: string, payload: VerificationRequestPayload) =>
    request<VerificationEvaluation>(`/workspaces/${workspaceId}/projects/${projectId}/verifications/evaluate`, { method: "POST", body: JSON.stringify(payload) }),
  listReleaseCandidates: (workspaceId: string, projectId: string, signal?: AbortSignal) =>
    request<ReleaseCandidate[]>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates`, { signal }),
  createReleaseCandidate: (workspaceId: string, projectId: string, payload: { title: string; intended_version?: string; description?: string; feature_ids: string[]; context_package_ids: string[]; evidence_ids: string[]; verification_ids: string[]; handoff_revision_ids: string[] }) =>
    request<ReleaseCandidate>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates`, { method: "POST", body: JSON.stringify(payload) }),
  getReleaseCandidate: (workspaceId: string, projectId: string, candidateId: string, signal?: AbortSignal) =>
    request<ReleaseCandidate>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates/${candidateId}`, { signal }),
  updateReleaseCandidate: (workspaceId: string, projectId: string, candidateId: string, payload: ReleaseCandidateInput & { expected_revision: number }) =>
    request<ReleaseCandidate>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates/${candidateId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  freezeReleaseCandidate: (workspaceId: string, projectId: string, candidateId: string, expectedRevision: number) =>
    request<ReleaseCandidate>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates/${candidateId}/freeze`, { method: "POST", body: JSON.stringify({ expected_revision: expectedRevision }) }),
  previewReleaseGates: (workspaceId: string, projectId: string, candidateId: string, signal?: AbortSignal) =>
    request<GateEvaluation>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates/${candidateId}/gates/preview`, { method: "POST", signal }),
  evaluateReleaseGates: (workspaceId: string, projectId: string, candidateId: string) =>
    request<GateEvaluation>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates/${candidateId}/gates/evaluate`, { method: "POST" }),
  listReleaseGateHistory: (workspaceId: string, projectId: string, candidateId: string, signal?: AbortSignal) =>
    request<GateEvaluation[]>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates/${candidateId}/gates`, { signal }),
  listCandidateHistory: (workspaceId: string, projectId: string, candidateId: string, signal?: AbortSignal) =>
    request<{ id: string; candidate_id: string; revision: number; status: string; content_fingerprint: string; snapshot: Record<string, unknown>; created_at: string }[]>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates/${candidateId}/revisions`, { signal }),
  saveReleaseManifest: (workspaceId: string, projectId: string, candidateId: string, gateEvaluationId: string) =>
    request<ReleaseManifest>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates/${candidateId}/manifest`, { method: "POST", body: JSON.stringify({ gate_evaluation_id: gateEvaluationId }) }),
  getReleaseManifest: (workspaceId: string, projectId: string, candidateId: string, signal?: AbortSignal) =>
    request<ReleaseManifest>(`/workspaces/${workspaceId}/projects/${projectId}/release-candidates/${candidateId}/manifest`, { signal }),
};
