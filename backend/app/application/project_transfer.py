"""Transactional, deterministic transfer of the supported Project planning graph."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.schemas.project_transfer import (
    SCHEMA_VERSION,
    ProjectImportCounts,
    ProjectImportCriterion,
    ProjectImportDependency,
    ProjectImportDocument,
    ProjectImportEpic,
    ProjectImportFeature,
    ProjectImportPreviewResponse,
    ProjectImportProject,
    ProjectImportTask,
)
from app.application.common.errors import DuplicateName, EntityNotFound, RevisionConflict
from app.application.common.validation import (
    clean_description,
    clean_name,
    clean_text,
    clean_title,
)
from app.domain.entities import (
    EpicStatus,
    FeaturePriority,
    FeatureStatus,
    ProjectStatus,
    TaskStatus,
)
from app.persistence.models import (
    AcceptanceCriterionModel,
    EpicModel,
    FeatureDependencyModel,
    FeatureModel,
    ProjectModel,
    TaskModel,
    WorkspaceModel,
)
from app.persistence.repositories import ProjectRepository, WorkspaceRepository


def canonical_import_json(document: ProjectImportDocument) -> str:
    normalized = ProjectTransferService.normalize(document)
    return json.dumps(
        normalized.model_dump(mode="json"),
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    )


def import_fingerprint(document: ProjectImportDocument) -> str:
    return hashlib.sha256(canonical_import_json(document).encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class ProjectImportResult:
    project: ProjectModel
    fingerprint: str
    references: list[tuple[str, str, str | None]]
    counts: ProjectImportCounts


class ProjectTransferService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.workspaces = WorkspaceRepository(session)
        self.projects = ProjectRepository(session)

    @staticmethod
    def normalize(document: ProjectImportDocument) -> ProjectImportDocument:
        def optional(value: str | None) -> str | None:
            return value.strip() if value is not None and value.strip() else None

        project = document.project.model_copy(
            update={
                "name": clean_name(document.project.name),
                "description": clean_description(document.project.description),
            }
        )
        epics = [
            epic.model_copy(
                update={"title": clean_title(epic.title), "description": optional(epic.description)}
            )
            for epic in document.epics
        ]
        features: list[ProjectImportFeature] = []
        for feature in document.features:
            tasks = [
                task.model_copy(
                    update={
                        "title": clean_title(task.title),
                        "description": optional(task.description),
                        "position": position,
                    }
                )
                for position, task in enumerate(feature.tasks)
            ]
            criteria = [
                criterion.model_copy(
                    update={
                        "description": clean_text(criterion.description),
                        "position": position,
                    }
                )
                for position, criterion in enumerate(feature.acceptance_criteria)
            ]
            features.append(
                feature.model_copy(
                    update={
                        "title": clean_title(feature.title),
                        "description": optional(feature.description),
                        "goal": optional(feature.goal),
                        "epic_ref": optional(feature.epic_ref),
                        "tasks": tasks,
                        "acceptance_criteria": criteria,
                    }
                )
            )
        return document.model_copy(
            update={"project": project, "epics": epics, "features": features}
        )

    @staticmethod
    def _all_refs(document: ProjectImportDocument) -> Iterable[str]:
        yield from (epic.ref for epic in document.epics)
        for feature in document.features:
            yield feature.ref
            yield from (task.ref for task in feature.tasks)
            yield from (criterion.ref for criterion in feature.acceptance_criteria)

    @staticmethod
    def validate(document: ProjectImportDocument) -> ProjectImportDocument:
        normalized = ProjectTransferService.normalize(document)
        refs = list(ProjectTransferService._all_refs(normalized))
        if len(refs) != len(set(refs)):
            raise ValueError("duplicate local reference")
        epic_refs = {epic.ref for epic in normalized.epics}
        feature_refs = {feature.ref for feature in normalized.features}
        for feature in normalized.features:
            if feature.epic_ref is not None and feature.epic_ref not in epic_refs:
                raise ValueError(f"Epic reference not found: {feature.epic_ref}")
        graph: dict[str, set[str]] = {feature_ref: set() for feature_ref in feature_refs}
        for dependency in normalized.dependencies:
            if dependency.blocking_feature_ref not in feature_refs:
                raise ValueError(f"Feature reference not found: {dependency.blocking_feature_ref}")
            if dependency.blocked_feature_ref not in feature_refs:
                raise ValueError(f"Feature reference not found: {dependency.blocked_feature_ref}")
            if dependency.blocking_feature_ref == dependency.blocked_feature_ref:
                raise ValueError("A feature dependency cannot point to itself")
            graph[dependency.blocking_feature_ref].add(dependency.blocked_feature_ref)
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(node: str) -> None:
            if node in visiting:
                raise ValueError("dependency cycle detected")
            if node in visited:
                return
            visiting.add(node)
            for child in sorted(graph[node]):
                visit(child)
            visiting.remove(node)
            visited.add(node)

        for feature_ref in sorted(graph):
            visit(feature_ref)
        return normalized

    @staticmethod
    def counts(document: ProjectImportDocument) -> ProjectImportCounts:
        return ProjectImportCounts(
            epics=len(document.epics),
            features=len(document.features),
            tasks=sum(len(feature.tasks) for feature in document.features),
            acceptance_criteria=sum(
                len(feature.acceptance_criteria) for feature in document.features
            ),
            dependencies=len(document.dependencies),
        )

    def _workspace(self, workspace_id: str) -> WorkspaceModel:
        workspace = self.workspaces.get(workspace_id)
        if workspace is None:
            raise EntityNotFound("Workspace not found")
        return workspace

    def preview(
        self, workspace_id: str, document: ProjectImportDocument
    ) -> ProjectImportPreviewResponse:
        normalized = self.validate(document)
        self._workspace(workspace_id)
        project_name_conflict = self.projects.find_by_name(workspace_id, normalized.project.name)
        return ProjectImportPreviewResponse(
            schema_version=SCHEMA_VERSION,
            workspace_id=workspace_id,
            fingerprint=import_fingerprint(normalized),
            project_name_conflict=project_name_conflict is not None,
            document=normalized,
            counts=self.counts(normalized),
        )

    def export_project(self, workspace_id: str, project_id: str) -> ProjectImportDocument:
        project = self.projects.get(workspace_id, project_id)
        if project is None:
            raise EntityNotFound("Project not found")
        epics = list(
            self.session.scalars(
                select(EpicModel)
                .where(EpicModel.project_id == project_id)
                .order_by(EpicModel.title, EpicModel.id)
            ).all()
        )
        features = list(
            self.session.scalars(
                select(FeatureModel)
                .where(FeatureModel.project_id == project_id)
                .order_by(FeatureModel.readable_id, FeatureModel.id)
            ).all()
        )
        epic_refs = {epic.id: f"epic:e{position:03d}" for position, epic in enumerate(epics, 1)}
        feature_refs = {
            feature.id: f"feature:f{position:03d}" for position, feature in enumerate(features, 1)
        }
        exported_features: list[ProjectImportFeature] = []
        for feature in features:
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
            exported_features.append(
                ProjectImportFeature(
                    ref=feature_refs[feature.id],
                    title=feature.title,
                    description=feature.description,
                    goal=feature.goal,
                    priority=FeaturePriority(feature.priority),
                    status=FeatureStatus(feature.status),
                    epic_ref=epic_refs.get(feature.epic_id) if feature.epic_id else None,
                    tasks=[
                        ProjectImportTask(
                            ref=f"task:{feature_refs[feature.id].removeprefix('feature:')}-t{position:03d}",
                            title=task.title,
                            description=task.description,
                            status=TaskStatus(task.status),
                            position=position - 1,
                        )
                        for position, task in enumerate(tasks, 1)
                    ],
                    acceptance_criteria=[
                        ProjectImportCriterion(
                            ref=f"criterion:{feature_refs[feature.id].removeprefix('feature:')}-c{position:03d}",
                            description=criterion.description,
                            satisfied=criterion.satisfied,
                            position=position - 1,
                        )
                        for position, criterion in enumerate(criteria, 1)
                    ],
                )
            )
        dependencies = list(
            self.session.scalars(
                select(FeatureDependencyModel)
                .where(FeatureDependencyModel.project_id == project_id)
                .order_by(
                    FeatureDependencyModel.blocking_feature_id,
                    FeatureDependencyModel.blocked_feature_id,
                    FeatureDependencyModel.id,
                )
            ).all()
        )
        document = ProjectImportDocument(
            schema_version=SCHEMA_VERSION,
            project=ProjectImportProject(name=project.name, description=project.description),
            epics=[
                ProjectImportEpic(
                    ref=epic_refs[epic.id],
                    title=epic.title,
                    description=epic.description,
                    status=EpicStatus(epic.status),
                )
                for epic in epics
            ],
            features=exported_features,
            dependencies=[
                ProjectImportDependency(
                    blocking_feature_ref=feature_refs[item.blocking_feature_id],
                    blocked_feature_ref=feature_refs[item.blocked_feature_id],
                )
                for item in dependencies
            ],
        )
        return self.validate(document)

    def import_project(
        self,
        workspace_id: str,
        document: ProjectImportDocument,
        expected_fingerprint: str,
    ) -> ProjectImportResult:
        normalized = self.validate(document)
        fingerprint = import_fingerprint(normalized)
        if fingerprint != expected_fingerprint:
            raise RevisionConflict("Import document changed after preview; preview it again")
        references: list[tuple[str, str, str | None]] = []
        try:
            with self.session.begin():
                self._workspace(workspace_id)
                if self.projects.find_by_name(workspace_id, normalized.project.name) is not None:
                    raise DuplicateName("A project with this name already exists in this workspace")
                project = ProjectModel(
                    workspace_id=workspace_id,
                    name=normalized.project.name,
                    description=normalized.project.description,
                    status=ProjectStatus.ACTIVE.value,
                )
                self.session.add(project)
                self.session.flush()
                references.append(("project", project.id, None))
                epic_ids: dict[str, str] = {}
                for epic in normalized.epics:
                    item = EpicModel(
                        project_id=project.id,
                        title=epic.title,
                        description=epic.description,
                        status=epic.status.value,
                    )
                    self.session.add(item)
                    self.session.flush()
                    epic_ids[epic.ref] = item.id
                    references.append((epic.ref, item.id, None))
                feature_ids: dict[str, str] = {}
                for feature in normalized.features:
                    feature_item = FeatureModel(
                        project_id=project.id,
                        epic_id=epic_ids.get(feature.epic_ref) if feature.epic_ref else None,
                        readable_id=f"FEAT-{len(feature_ids) + 1:03d}",
                        title=feature.title,
                        description=feature.description,
                        goal=feature.goal,
                        priority=feature.priority.value,
                        status=feature.status.value,
                    )
                    self.session.add(feature_item)
                    self.session.flush()
                    feature_ids[feature.ref] = feature_item.id
                    references.append((feature.ref, feature_item.id, None))
                    for task in feature.tasks:
                        task_item = TaskModel(
                            feature_id=feature_item.id,
                            title=task.title,
                            description=task.description,
                            status=task.status.value,
                            position=task.position or 0,
                        )
                        self.session.add(task_item)
                        self.session.flush()
                        references.append((task.ref, task_item.id, feature.ref))
                    for criterion in feature.acceptance_criteria:
                        criterion_item = AcceptanceCriterionModel(
                            feature_id=feature_item.id,
                            description=criterion.description,
                            satisfied=criterion.satisfied,
                            position=criterion.position or 0,
                        )
                        self.session.add(criterion_item)
                        self.session.flush()
                        references.append((criterion.ref, criterion_item.id, feature.ref))
                for dependency in normalized.dependencies:
                    dependency_item = FeatureDependencyModel(
                        project_id=project.id,
                        blocking_feature_id=feature_ids[dependency.blocking_feature_ref],
                        blocked_feature_id=feature_ids[dependency.blocked_feature_ref],
                    )
                    self.session.add(dependency_item)
                    self.session.flush()
                    references.append((
                        f"dependency:{dependency.blocking_feature_ref.removeprefix('feature:')}-{dependency.blocked_feature_ref.removeprefix('feature:')}",
                        dependency_item.id,
                        None,
                    ))
                self.session.flush()
        except IntegrityError as exc:
            raise DuplicateName(
                "A project with this name already exists in this workspace"
            ) from exc
        return ProjectImportResult(project, fingerprint, references, self.counts(normalized))
