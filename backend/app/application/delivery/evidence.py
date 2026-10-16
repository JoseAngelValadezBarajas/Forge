"""Evidence records, provenance enforcement and project-scoped lifecycle."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.application.services import EntityNotFound, InvalidInput
from app.persistence.models import (
    AcceptanceCriterionModel,
    AgentRunModel,
    ContextPackageModel,
    EvidenceRecordModel,
    FeatureModel,
    GitObservationModel,
    HandoffModel,
    HandoffRevisionModel,
)

from .base import DeliveryServiceBase, utc_now
from .constants import EVIDENCE_TYPES, SOURCE_KINDS
from .validation import _clean, _validate_reference


class EvidenceService(DeliveryServiceBase):
    def evidence_list(
        self,
        workspace_id: str,
        project_id: str,
        *,
        query: str | None = None,
        provenance: str | None = None,
        status: str | None = None,
    ) -> list[EvidenceRecordModel]:
        self.project(workspace_id, project_id)
        statement = select(EvidenceRecordModel).where(EvidenceRecordModel.project_id == project_id)
        if provenance:
            statement = statement.where(EvidenceRecordModel.provenance == provenance)
        if status:
            statement = statement.where(EvidenceRecordModel.status == status)
        if query and query.strip():
            value = f"%{query.strip()}%"
            statement = statement.where(EvidenceRecordModel.title.ilike(value))
        return list(
            self.session.scalars(
                statement.order_by(EvidenceRecordModel.recorded_at.desc(), EvidenceRecordModel.id)
            ).all()
        )

    def evidence_get(
        self, workspace_id: str, project_id: str, evidence_id: str
    ) -> EvidenceRecordModel:
        self.project(workspace_id, project_id)
        item = self.session.scalar(
            select(EvidenceRecordModel).where(
                EvidenceRecordModel.id == evidence_id, EvidenceRecordModel.project_id == project_id
            )
        )
        if item is None:
            raise EntityNotFound("Evidence record not found")
        return item

    def evidence_create(
        self, workspace_id: str, project_id: str, values: dict[str, Any]
    ) -> EvidenceRecordModel:
        project = self.project(workspace_id, project_id, writable=True)
        evidence_type = values["evidence_type"]
        source_kind = values["source_kind"]
        if evidence_type not in EVIDENCE_TYPES or source_kind not in SOURCE_KINDS:
            raise InvalidInput("Evidence type or source kind is not supported")
        feature_id = values.get("feature_id")
        criterion_id = values.get("acceptance_criterion_id")
        feature = None
        if feature_id:
            feature = self.session.scalar(
                select(FeatureModel).where(
                    FeatureModel.id == feature_id, FeatureModel.project_id == project_id
                )
            )
            if feature is None:
                raise InvalidInput("Feature must belong to this Project")
        elif criterion_id:
            raise InvalidInput("A Feature is required when linking an acceptance criterion")
        if criterion_id:
            criterion = self.session.scalar(
                select(AcceptanceCriterionModel).where(
                    AcceptanceCriterionModel.id == criterion_id,
                    AcceptanceCriterionModel.feature_id == feature_id,
                )
            )
            if criterion is None:
                raise InvalidInput("Acceptance criterion must belong to the selected Feature")
        refs: dict[str, str | None] = {
            "source_reference": _validate_reference(source_kind, values.get("source_reference")),
            "context_package_id": None,
            "git_observation_id": None,
            "handoff_revision_id": None,
            "run_id": values.get("run_id"),
        }
        if source_kind == "context_package":
            package = self.session.get(ContextPackageModel, refs["source_reference"])
            if (
                package is None
                or package.project_id != project_id
                or package.feature_id != feature_id
            ):
                raise InvalidInput(
                    "Context Package must belong to the selected Feature and Project"
                )
            refs["context_package_id"] = package.id
        elif source_kind == "git_observation":
            observation = self.session.get(GitObservationModel, refs["source_reference"])
            if observation is None:
                raise InvalidInput("Git observation must belong to this Project")
            connection = None
            from app.persistence.models import RepositoryConnectionModel

            connection = self.session.get(RepositoryConnectionModel, observation.repository_id)
            if connection is None or connection.project_id != project_id:
                raise InvalidInput("Git observation must belong to this Project")
            refs["git_observation_id"] = observation.id
        elif source_kind == "handoff_revision":
            revision = self.session.get(HandoffRevisionModel, refs["source_reference"])
            if revision is None:
                raise InvalidInput(
                    "Handoff revision must belong to the selected Feature and Project"
                )
            handoff = self.session.get(HandoffModel, revision.handoff_id) if revision else None
            if (
                handoff is None
                or handoff.project_id != project_id
                or handoff.feature_id != feature_id
            ):
                raise InvalidInput(
                    "Handoff revision must belong to the selected Feature and Project"
                )
            refs["handoff_revision_id"] = revision.id
        if refs["run_id"]:
            run = self.session.get(AgentRunModel, refs["run_id"])
            if run is None or run.project_id != project_id or run.feature_id != feature_id:
                raise InvalidInput("Run must belong to the selected Feature and Project")
        provenance = (
            "OBSERVED"
            if source_kind in {"git_observation", "context_package", "handoff_revision"}
            else "REPORTED"
        )
        item = EvidenceRecordModel(
            id=str(uuid4()),
            project_id=project.id,
            feature_id=feature_id,
            acceptance_criterion_id=criterion_id,
            run_id=refs["run_id"],
            handoff_revision_id=refs["handoff_revision_id"],
            context_package_id=refs["context_package_id"],
            git_observation_id=refs["git_observation_id"],
            evidence_type=evidence_type,
            title=_clean(values["title"], "Title", 200),
            description=(values.get("description") or "").strip(),
            source_kind=source_kind,
            source_reference=refs["source_reference"],
            provenance=provenance,
            declared_outcome=(values.get("declared_outcome") or "").strip() or None,
            status="ACTIVE",
            recorded_at=utc_now(),
        )
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return item

    def evidence_invalidate(
        self, workspace_id: str, project_id: str, evidence_id: str
    ) -> EvidenceRecordModel:
        self.project(workspace_id, project_id, writable=True)
        item = self.evidence_get(workspace_id, project_id, evidence_id)
        if item.status != "ACTIVE":
            raise InvalidInput("Only active evidence can be invalidated")
        item.status = "INVALIDATED"
        item.invalidated_at = utc_now()
        item.version += 1
        self.session.commit()
        self.session.refresh(item)
        return item
