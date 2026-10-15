"""Release candidate selection, revisions, immutable freeze and snapshot capture."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.application.services import EntityNotFound, InvalidInput, RevisionConflict
from app.persistence.models import (
    AcceptanceCriterionModel,
    ContextPackageModel,
    EvidenceRecordModel,
    HandoffModel,
    HandoffRevisionModel,
    ProjectModel,
    ReleaseCandidateModel,
    ReleaseCandidateRevisionModel,
    VerificationEvaluationModel,
)

from .base import DeliveryServiceBase, utc_now
from .constants import CANDIDATE_SCHEMA, RELEASE_RULESET
from .serialization import _json, canonical_json, digest
from .validation import _clean, _portable_text, _unique


class CandidateService(DeliveryServiceBase):
    def _selection(self, project_id: str, values: dict[str, Any]) -> dict[str, Any]:
        feature_ids = _unique(values.get("feature_ids", []))
        self.features(project_id, feature_ids)
        contexts = _unique(values.get("context_package_ids", []))
        evidences = _unique(values.get("evidence_ids", []))
        verifications = _unique(values.get("verification_ids", []))
        handoffs = _unique(values.get("handoff_revision_ids", []))
        package_rows = (
            list(
                self.session.scalars(
                    select(ContextPackageModel).where(
                        ContextPackageModel.project_id == project_id,
                        ContextPackageModel.id.in_(contexts),
                    )
                ).all()
            )
            if contexts
            else []
        )
        if len(package_rows) != len(contexts) or any(
            row.feature_id not in feature_ids for row in package_rows
        ):
            raise InvalidInput("Context Packages must belong to selected Features in this Project")
        evidence_rows = (
            list(
                self.session.scalars(
                    select(EvidenceRecordModel).where(
                        EvidenceRecordModel.project_id == project_id,
                        EvidenceRecordModel.id.in_(evidences),
                    )
                ).all()
            )
            if evidences
            else []
        )
        if len(evidence_rows) != len(evidences) or any(
            row.feature_id not in {None, *feature_ids} for row in evidence_rows
        ):
            raise InvalidInput("Evidence must belong to this Project and selected Features")
        verification_rows = (
            list(
                self.session.scalars(
                    select(VerificationEvaluationModel).where(
                        VerificationEvaluationModel.project_id == project_id,
                        VerificationEvaluationModel.id.in_(verifications),
                    )
                ).all()
            )
            if verifications
            else []
        )
        if len(verification_rows) != len(verifications) or any(
            row.feature_id not in {None, *feature_ids} for row in verification_rows
        ):
            raise InvalidInput("Verifications must belong to this Project and selected Features")
        if handoffs:
            handoff_rows = list(
                self.session.scalars(
                    select(HandoffRevisionModel).where(HandoffRevisionModel.id.in_(handoffs))
                ).all()
            )
            parents = {
                row.id: self.session.get(HandoffModel, row.handoff_id) for row in handoff_rows
            }
            if len(handoff_rows) != len(handoffs) or any(
                parent is None
                or parent.project_id != project_id
                or parent.feature_id not in feature_ids
                for parent in parents.values()
            ):
                raise InvalidInput(
                    "Handoff revisions must belong to selected Features in this Project"
                )
        return {
            "feature_ids": feature_ids,
            "context_package_ids": contexts,
            "evidence_ids": evidences,
            "verification_ids": verifications,
            "handoff_revision_ids": handoffs,
        }

    def candidate_list(self, workspace_id: str, project_id: str) -> list[ReleaseCandidateModel]:
        self.project(workspace_id, project_id)
        return list(
            self.session.scalars(
                select(ReleaseCandidateModel)
                .where(ReleaseCandidateModel.project_id == project_id)
                .order_by(ReleaseCandidateModel.created_at.desc(), ReleaseCandidateModel.id)
            ).all()
        )

    def candidate_get(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> ReleaseCandidateModel:
        self.project(workspace_id, project_id)
        item = self.session.scalar(
            select(ReleaseCandidateModel).where(
                ReleaseCandidateModel.id == candidate_id,
                ReleaseCandidateModel.project_id == project_id,
            )
        )
        if item is None:
            raise EntityNotFound("Release Candidate not found")
        return item

    def candidate_create(
        self, workspace_id: str, project_id: str, values: dict[str, Any]
    ) -> ReleaseCandidateModel:
        self.project(workspace_id, project_id, writable=True)
        selection = self._selection(project_id, values)
        title = _clean(values["title"], "Candidate title", 200)
        candidate_id = str(uuid4())
        key = "RC-" + candidate_id[:8].upper()
        content = {
            "project_id": project_id,
            "candidate_key": key,
            "title": title,
            "intended_version": values.get("intended_version"),
            "description": (values.get("description") or "").strip(),
            "selection": selection,
        }
        item = ReleaseCandidateModel(
            id=candidate_id,
            project_id=project_id,
            candidate_key=key,
            title=title,
            intended_version=values.get("intended_version"),
            description=content["description"],
            status="DRAFT",
            schema_version=CANDIDATE_SCHEMA,
            revision=1,
            content_fingerprint=digest(canonical_json(content)),
            selection_json=canonical_json(selection),
            snapshot_json=None,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        self.session.add(item)
        self.session.flush()
        self.session.add(
            ReleaseCandidateRevisionModel(
                id=str(uuid4()),
                candidate_id=item.id,
                revision=1,
                status="DRAFT",
                content_fingerprint=item.content_fingerprint,
                snapshot_json=canonical_json(content),
                created_at=utc_now(),
            )
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    def candidate_update(
        self, workspace_id: str, project_id: str, candidate_id: str, values: dict[str, Any]
    ) -> ReleaseCandidateModel:
        self.project(workspace_id, project_id, writable=True)
        item = self.candidate_get(workspace_id, project_id, candidate_id)
        if item.status != "DRAFT":
            raise InvalidInput("Frozen candidates cannot be edited; create a new candidate")
        if values["expected_revision"] != item.revision:
            raise RevisionConflict("Candidate changed; reload before editing")
        selection = self._selection(project_id, values)
        title = _clean(values["title"], "Candidate title", 200)
        revision = item.revision + 1
        description = (values.get("description") or "").strip()
        content = {
            "project_id": project_id,
            "candidate_key": item.candidate_key,
            "title": title,
            "intended_version": values.get("intended_version"),
            "description": description,
            "selection": selection,
        }
        item.title = title
        item.intended_version = values.get("intended_version")
        item.description = description
        item.selection_json = canonical_json(selection)
        item.revision = revision
        item.content_fingerprint = digest(canonical_json(content))
        item.updated_at = utc_now()
        self.session.add(
            ReleaseCandidateRevisionModel(
                id=str(uuid4()),
                candidate_id=item.id,
                revision=revision,
                status="DRAFT",
                content_fingerprint=item.content_fingerprint,
                snapshot_json=canonical_json(content),
                created_at=utc_now(),
            )
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    def _capture_candidate(self, item: ReleaseCandidateModel) -> dict[str, Any]:
        selection = _json(item.selection_json)
        project = self.session.get(ProjectModel, item.project_id)
        if project is None:
            raise EntityNotFound("Project not found")
        features = self.features(item.project_id, selection["feature_ids"])
        feature_records = [
            {
                "id": row.id,
                "project_id": row.project_id,
                "key": row.readable_id,
                "title": _portable_text(row.title),
                "goal": _portable_text(row.goal),
                "status": row.status,
            }
            for row in features
        ]
        criteria = (
            list(
                self.session.scalars(
                    select(AcceptanceCriterionModel).where(
                        AcceptanceCriterionModel.feature_id.in_(selection["feature_ids"])
                    )
                ).all()
            )
            if selection["feature_ids"]
            else []
        )
        criterion_records = [
            {
                "id": row.id,
                "feature_id": row.feature_id,
                "description": _portable_text(row.description),
                "satisfied": row.satisfied,
                "position": row.position,
                "updated_at": row.updated_at.isoformat(),
            }
            for row in sorted(
                criteria, key=lambda value: (value.feature_id, value.position, value.id)
            )
        ]
        contexts = (
            list(
                self.session.scalars(
                    select(ContextPackageModel).where(
                        ContextPackageModel.id.in_(selection["context_package_ids"])
                    )
                ).all()
            )
            if selection["context_package_ids"]
            else []
        )
        context_records = [
            {
                "id": row.id,
                "project_id": row.project_id,
                "feature_id": row.feature_id,
                "schema_version": row.schema_version,
                "fingerprint": row.fingerprint,
                "payload_digest": digest(canonical_json(_json(row.payload_json))),
            }
            for row in sorted(contexts, key=lambda value: value.id)
        ]
        evidences = (
            list(
                self.session.scalars(
                    select(EvidenceRecordModel).where(
                        EvidenceRecordModel.id.in_(selection["evidence_ids"])
                    )
                ).all()
            )
            if selection["evidence_ids"]
            else []
        )
        evidence_records: list[dict[str, Any]] = []
        for row in sorted(evidences, key=lambda value: value.id):
            evidence_payload = {
                "id": row.id,
                "project_id": row.project_id,
                "feature_id": row.feature_id,
                "acceptance_criterion_id": row.acceptance_criterion_id,
                "title": _portable_text(row.title),
                "description": _portable_text(row.description),
                "declared_outcome": _portable_text(row.declared_outcome),
                "evidence_type": row.evidence_type,
                "source_kind": row.source_kind,
                "source_reference_digest": digest(row.source_reference)
                if row.source_reference
                else None,
                "provenance": row.provenance,
                "status": row.status,
                "version": row.version,
            }
            evidence_payload["record_fingerprint"] = digest(canonical_json(evidence_payload))
            evidence_records.append(evidence_payload)
        verification_rows = (
            list(
                self.session.scalars(
                    select(VerificationEvaluationModel).where(
                        VerificationEvaluationModel.id.in_(selection["verification_ids"])
                    )
                ).all()
            )
            if selection["verification_ids"]
            else []
        )
        verifications = [
            {
                "id": row.id,
                "project_id": row.project_id,
                "feature_id": row.feature_id,
                "rule_id": row.rule_id,
                "rule_version": row.rule_version,
                "result": row.result,
                "input_fingerprint": row.input_fingerprint,
                "evidence_ids": _json(row.evidence_ids_json),
                "subject": _json(row.subject_json),
                "inputs": _json(row.input_json),
                "verifier_version": row.verifier_version,
            }
            for row in sorted(verification_rows, key=lambda value: value.id)
        ]
        handoff_rows = (
            list(
                self.session.scalars(
                    select(HandoffRevisionModel).where(
                        HandoffRevisionModel.id.in_(selection["handoff_revision_ids"])
                    )
                ).all()
            )
            if selection["handoff_revision_ids"]
            else []
        )
        handoffs: list[dict[str, Any]] = []
        for handoff_revision in sorted(handoff_rows, key=lambda value: value.id):
            parent = self.session.get(HandoffModel, handoff_revision.handoff_id)
            handoffs.append(
                {
                    "id": handoff_revision.id,
                    "handoff_id": handoff_revision.handoff_id,
                    "revision": handoff_revision.revision,
                    "fingerprint": handoff_revision.fingerprint,
                    "context_fingerprint": handoff_revision.context_fingerprint,
                    "project_id": parent.project_id if parent is not None else None,
                    "feature_id": parent.feature_id if parent is not None else None,
                }
            )
        return {
            "schema_version": CANDIDATE_SCHEMA,
            "project_id": item.project_id,
            "project": {"id": project.id, "name": _portable_text(project.name)},
            "candidate_id": item.id,
            "candidate_key": item.candidate_key,
            "candidate_revision": item.revision,
            "title": _portable_text(item.title),
            "intended_version": _portable_text(item.intended_version),
            "scope": selection,
            "features": feature_records,
            "acceptance_criteria": criterion_records,
            "context_packages": context_records,
            "evidence_records": evidence_records,
            "verification_evaluations": verifications,
            "handoff_revisions": handoffs,
            "ruleset_version": RELEASE_RULESET,
            "captured_at": utc_now().isoformat(),
            "publication_status": "NOT_PUBLISHED",
        }

    def candidate_freeze(
        self, workspace_id: str, project_id: str, candidate_id: str, expected_revision: int
    ) -> ReleaseCandidateModel:
        self.project(workspace_id, project_id, writable=True)
        item = self.candidate_get(workspace_id, project_id, candidate_id)
        if item.status != "DRAFT":
            raise InvalidInput("Candidate is already frozen")
        if expected_revision != item.revision:
            raise RevisionConflict("Candidate changed; reload before freezing")
        item.revision += 1
        snapshot = self._capture_candidate(item)
        snapshot_json = canonical_json(snapshot)
        item.status = "FROZEN"
        item.snapshot_json = snapshot_json
        item.content_fingerprint = digest(snapshot_json)
        item.updated_at = utc_now()
        item.frozen_at = utc_now()
        self.session.add(
            ReleaseCandidateRevisionModel(
                id=str(uuid4()),
                candidate_id=item.id,
                revision=item.revision,
                status="FROZEN",
                content_fingerprint=item.content_fingerprint,
                snapshot_json=snapshot_json,
                created_at=utc_now(),
            )
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    def candidate_history(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> list[ReleaseCandidateRevisionModel]:
        self.candidate_get(workspace_id, project_id, candidate_id)
        return list(
            self.session.scalars(
                select(ReleaseCandidateRevisionModel)
                .where(ReleaseCandidateRevisionModel.candidate_id == candidate_id)
                .order_by(ReleaseCandidateRevisionModel.revision.desc())
            ).all()
        )
