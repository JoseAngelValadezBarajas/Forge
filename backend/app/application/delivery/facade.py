"""Application-facing compatibility facade for Delivery use cases."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.persistence.models import (
    EvidenceRecordModel,
    FeatureModel,
    ProjectModel,
    ReleaseCandidateModel,
    ReleaseCandidateRevisionModel,
    ReleaseGateEvaluationModel,
    ReleaseManifestModel,
    VerificationEvaluationModel,
)

from .base import DeliveryContext
from .candidates import CandidateService
from .evidence import EvidenceService
from .gates import GateService
from .manifests import ManifestService
from .verification import VerificationService


class DeliveryService:
    """Keep the historical API while delegating each use case to its owning service."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self._context = DeliveryContext(session)
        self.projects = self._context.projects
        self.verifier = self._context.verifier
        self._evidence = EvidenceService(self._context)
        self._verifications = VerificationService(self._context)
        self._candidates = CandidateService(self._context)
        self._gates = GateService(self._context, self._candidates, self._verifications)
        self._manifests = ManifestService(self._context, self._candidates)

    def project(
        self, workspace_id: str, project_id: str, *, writable: bool = False
    ) -> ProjectModel:
        return self._context.project(workspace_id, project_id, writable=writable)

    def features(self, project_id: str, ids: list[str]) -> list[FeatureModel]:
        return self._context.features(project_id, ids)

    def evidence_list(
        self,
        workspace_id: str,
        project_id: str,
        *,
        query: str | None = None,
        provenance: str | None = None,
        status: str | None = None,
    ) -> list[EvidenceRecordModel]:
        return self._evidence.evidence_list(
            workspace_id, project_id, query=query, provenance=provenance, status=status
        )

    def evidence_get(
        self, workspace_id: str, project_id: str, evidence_id: str
    ) -> EvidenceRecordModel:
        return self._evidence.evidence_get(workspace_id, project_id, evidence_id)

    def evidence_create(
        self, workspace_id: str, project_id: str, values: dict[str, Any]
    ) -> EvidenceRecordModel:
        return self._evidence.evidence_create(workspace_id, project_id, values)

    def evidence_invalidate(
        self, workspace_id: str, project_id: str, evidence_id: str
    ) -> EvidenceRecordModel:
        return self._evidence.evidence_invalidate(workspace_id, project_id, evidence_id)

    @staticmethod
    def rule_catalog() -> list[dict[str, Any]]:
        return VerificationService.rule_catalog()

    def verification_preview(
        self, workspace_id: str, project_id: str, rule_id: str, values: dict[str, Any]
    ) -> dict[str, Any]:
        return self._verifications.verification_preview(workspace_id, project_id, rule_id, values)

    def verification_evaluate(
        self, workspace_id: str, project_id: str, rule_id: str, values: dict[str, Any]
    ) -> VerificationEvaluationModel:
        return self._verifications.verification_evaluate(workspace_id, project_id, rule_id, values)

    def verification_list(
        self, workspace_id: str, project_id: str
    ) -> list[VerificationEvaluationModel]:
        return self._verifications.verification_list(workspace_id, project_id)

    def verification_get(
        self, workspace_id: str, project_id: str, evaluation_id: str
    ) -> VerificationEvaluationModel:
        return self._verifications.verification_get(workspace_id, project_id, evaluation_id)

    def verification_is_stale(
        self, workspace_id: str, project_id: str, item: VerificationEvaluationModel
    ) -> bool:
        return self._verifications.verification_is_stale(workspace_id, project_id, item)

    def candidate_list(self, workspace_id: str, project_id: str) -> list[ReleaseCandidateModel]:
        return self._candidates.candidate_list(workspace_id, project_id)

    def candidate_get(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> ReleaseCandidateModel:
        return self._candidates.candidate_get(workspace_id, project_id, candidate_id)

    def candidate_create(
        self, workspace_id: str, project_id: str, values: dict[str, Any]
    ) -> ReleaseCandidateModel:
        return self._candidates.candidate_create(workspace_id, project_id, values)

    def candidate_update(
        self, workspace_id: str, project_id: str, candidate_id: str, values: dict[str, Any]
    ) -> ReleaseCandidateModel:
        return self._candidates.candidate_update(workspace_id, project_id, candidate_id, values)

    def candidate_freeze(
        self, workspace_id: str, project_id: str, candidate_id: str, expected_revision: int
    ) -> ReleaseCandidateModel:
        return self._candidates.candidate_freeze(
            workspace_id, project_id, candidate_id, expected_revision
        )

    def candidate_gate_preview(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> dict[str, Any]:
        return self._gates.candidate_gate_preview(workspace_id, project_id, candidate_id)

    def candidate_gate_evaluate(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> ReleaseGateEvaluationModel:
        return self._gates.candidate_gate_evaluate(workspace_id, project_id, candidate_id)

    def candidate_gate_history(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> list[ReleaseGateEvaluationModel]:
        return self._gates.candidate_gate_history(workspace_id, project_id, candidate_id)

    def manifest_save(
        self, workspace_id: str, project_id: str, candidate_id: str, gate_id: str
    ) -> ReleaseManifestModel:
        return self._manifests.manifest_save(workspace_id, project_id, candidate_id, gate_id)

    def manifest_get(
        self, workspace_id: str, project_id: str, candidate_id: str, manifest_id: str | None = None
    ) -> ReleaseManifestModel:
        return self._manifests.manifest_get(workspace_id, project_id, candidate_id, manifest_id)

    def candidate_history(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> list[ReleaseCandidateRevisionModel]:
        return self._candidates.candidate_history(workspace_id, project_id, candidate_id)
