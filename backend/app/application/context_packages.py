"""Deterministic Context Package application use cases."""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.common.errors import EntityNotFound
from app.application.common.validation import now
from app.application.planning import PlanningService
from app.application.readiness import ReadinessEngine
from app.context.packages import ContextPackageBuilder, ContextPackageSnapshot
from app.persistence.models import (
    AcceptanceCriterionModel,
    ContextPackageModel,
    DecisionFeatureLinkModel,
    DecisionModel,
    FeatureDependencyModel,
    FeatureModel,
    FeatureRepositoryLinkModel,
    GitObservationModel,
    InvariantAcknowledgementModel,
    InvariantModel,
    ProjectModel,
    ReadinessEvaluationModel,
    TaskModel,
)


class ContextPackageService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.projects = PlanningService(session)
        self.builder = ContextPackageBuilder()

    def preview(
        self, workspace_id: str, project_id: str, feature_id: str
    ) -> ContextPackageSnapshot:
        project, feature = self._scope(workspace_id, project_id, feature_id)
        return self._build(project, feature)

    def save(self, workspace_id: str, project_id: str, feature_id: str) -> ContextPackageModel:
        project = self.projects.writable_project(workspace_id, project_id)
        feature = self._feature(project.id, feature_id)
        snapshot = self._build(project, feature)
        existing = self.session.scalar(
            select(ContextPackageModel).where(
                ContextPackageModel.feature_id == feature.id,
                ContextPackageModel.schema_version == snapshot.schema_version,
                ContextPackageModel.fingerprint == snapshot.fingerprint,
            )
        )
        if existing is not None:
            return existing
        package = ContextPackageModel(
            id=str(uuid4()),
            project_id=project.id,
            feature_id=feature.id,
            schema_version=snapshot.schema_version,
            fingerprint=snapshot.fingerprint,
            created_at=now(),
            payload_json=snapshot.canonical_json,
            markdown=snapshot.markdown,
        )
        self.session.add(package)
        try:
            self.session.commit()
        except IntegrityError:
            self.session.rollback()
            existing = self.session.scalar(
                select(ContextPackageModel).where(
                    ContextPackageModel.feature_id == feature.id,
                    ContextPackageModel.schema_version == snapshot.schema_version,
                    ContextPackageModel.fingerprint == snapshot.fingerprint,
                )
            )
            if existing is None:
                raise
            return existing
        self.session.refresh(package)
        return package

    def list(
        self, workspace_id: str, project_id: str, feature_id: str
    ) -> list[ContextPackageModel]:
        self.projects.project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        return list(
            self.session.scalars(
                select(ContextPackageModel)
                .where(
                    ContextPackageModel.project_id == project_id,
                    ContextPackageModel.feature_id == feature_id,
                )
                .order_by(ContextPackageModel.created_at.desc(), ContextPackageModel.id.desc())
            ).all()
        )

    def get(
        self, workspace_id: str, project_id: str, feature_id: str, package_id: str
    ) -> ContextPackageModel:
        self.projects.project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        package = self.session.scalar(
            select(ContextPackageModel).where(
                ContextPackageModel.id == package_id,
                ContextPackageModel.project_id == project_id,
                ContextPackageModel.feature_id == feature_id,
            )
        )
        if package is None:
            raise EntityNotFound("Context package not found")
        return package

    def _scope(
        self, workspace_id: str, project_id: str, feature_id: str
    ) -> tuple[ProjectModel, FeatureModel]:
        project = self.projects.project(workspace_id, project_id)
        return project, self._feature(project_id, feature_id)

    def _feature(self, project_id: str, feature_id: str) -> FeatureModel:
        feature = self.session.scalar(
            select(FeatureModel).where(
                FeatureModel.id == feature_id, FeatureModel.project_id == project_id
            )
        )
        if feature is None:
            raise EntityNotFound("Feature not found")
        return feature

    def _build(self, project: ProjectModel, feature: FeatureModel) -> ContextPackageSnapshot:
        tasks = list(
            self.session.scalars(
                select(TaskModel)
                .where(TaskModel.feature_id == feature.id)
                .order_by(TaskModel.position, TaskModel.id)
            ).all()
        )
        criteria = list(
            self.session.scalars(
                select(AcceptanceCriterionModel)
                .where(AcceptanceCriterionModel.feature_id == feature.id)
                .order_by(AcceptanceCriterionModel.position, AcceptanceCriterionModel.id)
            ).all()
        )
        dependencies = list(
            self.session.scalars(
                select(FeatureDependencyModel)
                .where(FeatureDependencyModel.project_id == project.id)
                .where(
                    (FeatureDependencyModel.blocked_feature_id == feature.id)
                    | (FeatureDependencyModel.blocking_feature_id == feature.id)
                )
            ).all()
        )
        decisions = list(
            self.session.scalars(
                select(DecisionModel)
                .join(
                    DecisionFeatureLinkModel,
                    DecisionFeatureLinkModel.decision_id == DecisionModel.id,
                )
                .where(
                    DecisionFeatureLinkModel.feature_id == feature.id,
                    DecisionModel.project_id == project.id,
                )
            ).all()
        )
        invariants = list(
            self.session.scalars(
                select(InvariantModel).where(
                    InvariantModel.project_id == project.id,
                    InvariantModel.status == "active",
                    (
                        InvariantModel.feature_id.is_(None)
                        | (InvariantModel.feature_id == feature.id)
                    ),
                )
            ).all()
        )
        acknowledgements = {
            item.invariant_id: item
            for item in self.session.scalars(
                select(InvariantAcknowledgementModel).where(
                    InvariantAcknowledgementModel.feature_id == feature.id
                )
            ).all()
        }
        latest = self.session.scalar(
            select(ReadinessEvaluationModel)
            .where(ReadinessEvaluationModel.feature_id == feature.id)
            .order_by(
                ReadinessEvaluationModel.evaluated_at.desc(), ReadinessEvaluationModel.id.desc()
            )
        )
        readiness = self._readiness(latest, project, feature)
        links = list(
            self.session.scalars(
                select(FeatureRepositoryLinkModel).where(
                    FeatureRepositoryLinkModel.feature_id == feature.id
                )
            ).all()
        )
        observations: list[dict[str, Any]] = []
        for link in links:
            observation = self.session.scalar(
                select(GitObservationModel)
                .where(GitObservationModel.repository_id == link.repository_id)
                .order_by(GitObservationModel.observed_at.desc(), GitObservationModel.id.desc())
            )
            if observation is not None:
                observations.append(self._observation(observation, link.repository_id))
        return self.builder.build(
            project={
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "status": project.status,
            },
            feature={
                "id": feature.id,
                "key": feature.readable_id,
                "title": feature.title,
                "description": feature.description,
                "goal": feature.goal,
                "priority": feature.priority,
                "status": feature.status,
            },
            planning={
                "tasks": [self._task(item) for item in tasks],
                "acceptance_criteria": [self._criterion(item) for item in criteria],
            },
            dependencies=[self._dependency(item, feature.id) for item in dependencies],
            decisions=[self._decision(item) for item in decisions],
            invariants=[
                self._invariant(item, acknowledgements.get(item.id)) for item in invariants
            ],
            readiness=readiness,
            observations=observations,
        )

    def _readiness(
        self, item: ReadinessEvaluationModel | None, project: ProjectModel, feature: FeatureModel
    ) -> dict[str, Any] | None:
        if item is None:
            return None
        current = ReadinessEngine(self.session).fingerprint(project, feature)
        stored = json.loads(item.results_json)
        return {
            "evaluation_id": item.id,
            "evaluated_at": self._iso(item.evaluated_at),
            "rule_set_version": item.rule_set_version,
            "input_fingerprint": item.input_fingerprint,
            "outcome": item.outcome,
            "stale": current != item.input_fingerprint,
            "blockers": stored.get("blockers", []),
        }

    @staticmethod
    def _task(item: TaskModel) -> dict[str, Any]:
        return {
            "id": item.id,
            "title": item.title,
            "description": item.description,
            "status": item.status,
            "position": item.position,
        }

    @staticmethod
    def _criterion(item: AcceptanceCriterionModel) -> dict[str, Any]:
        return {
            "id": item.id,
            "description": item.description,
            "satisfied": item.satisfied,
            "position": item.position,
        }

    @staticmethod
    def _dependency(item: FeatureDependencyModel, feature_id: str) -> dict[str, Any]:
        return {
            "id": item.id,
            "blocking_feature_id": item.blocking_feature_id,
            "blocked_feature_id": item.blocked_feature_id,
            "direction": "blocked_by" if item.blocked_feature_id == feature_id else "blocks",
        }

    @staticmethod
    def _decision(item: DecisionModel) -> dict[str, Any]:
        return {
            "id": item.id,
            "title": item.title,
            "context": item.context,
            "decision": item.decision,
            "rationale": item.rationale,
            "alternatives_considered": item.alternatives_considered,
            "tradeoffs": item.tradeoffs,
            "status": item.status,
            "revision": item.revision,
            "superseded_by_id": item.superseded_by_id,
        }

    @staticmethod
    def _invariant(
        item: InvariantModel, acknowledgement: InvariantAcknowledgementModel | None
    ) -> dict[str, Any]:
        return {
            "id": item.id,
            "title": item.title,
            "statement": item.statement,
            "rationale": item.rationale,
            "status": item.status,
            "revision": item.revision,
            "scope": "project" if item.feature_id is None else "feature",
            "acknowledged_revision": acknowledgement.acknowledged_revision
            if acknowledgement
            else None,
        }

    @classmethod
    def _observation(cls, item: GitObservationModel, repository_id: str) -> dict[str, Any]:
        return {
            "id": item.id,
            "repository_id": repository_id,
            "observed_at": cls._iso(item.observed_at),
            "head_sha": item.head_sha,
            "branch": item.branch,
            "detached": item.detached,
            "unborn": item.unborn,
            "clean": item.clean,
            "tracked_modified_count": item.tracked_modified_count,
            "staged_count": item.staged_count,
            "untracked_count": item.untracked_count,
            "observer_version": item.observer_version,
            "status": item.status,
            "error_code": item.error_code,
        }

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.replace(tzinfo=UTC).isoformat()
