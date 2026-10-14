from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

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


class ServiceError(Exception):
    pass


class EntityNotFound(ServiceError):
    pass


class DuplicateName(ServiceError):
    pass


class InvalidInput(ServiceError):
    pass


def clean_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise InvalidInput("Name is required")
    if len(name) > 120:
        raise InvalidInput("Name must be 120 characters or fewer")
    return name


def clean_description(value: str | None) -> str | None:
    if value is None:
        return None
    description = value.strip()
    return description or None


def now() -> datetime:
    return datetime.now(UTC)


def ensure_local_workspace(session: Session) -> WorkspaceModel:
    repository = WorkspaceRepository(session)
    workspace = repository.find_by_name("Local Workspace")
    if workspace is None:
        workspace = WorkspaceModel(
            name="Local Workspace", description="Local-first Forge workspace"
        )
        session.add(workspace)
        session.commit()
        session.refresh(workspace)
    return workspace


class WorkspaceService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = WorkspaceRepository(session)

    def list(self) -> list[WorkspaceModel]:
        return list(self.repository.list())

    def get(self, workspace_id: str) -> WorkspaceModel:
        workspace = self.repository.get(workspace_id)
        if workspace is None:
            raise EntityNotFound("Workspace not found")
        return workspace

    def create(self, name: str, description: str | None) -> WorkspaceModel:
        clean = clean_name(name)
        if self.repository.find_by_name(clean) is not None:
            raise DuplicateName("A workspace with this name already exists")
        workspace = WorkspaceModel(name=clean, description=clean_description(description))
        self.session.add(workspace)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise DuplicateName("A workspace with this name already exists") from exc
        self.session.refresh(workspace)
        return workspace

    def update(
        self, workspace_id: str, name: str | None, description: str | None
    ) -> WorkspaceModel:
        workspace = self.get(workspace_id)
        if name is not None:
            clean = clean_name(name)
            duplicate = self.repository.find_by_name(clean)
            if duplicate is not None and duplicate.id != workspace_id:
                raise DuplicateName("A workspace with this name already exists")
            workspace.name = clean
        if description is not None:
            workspace.description = clean_description(description)
        workspace.updated_at = now()
        self.session.commit()
        self.session.refresh(workspace)
        return workspace


class ProjectService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.workspaces = WorkspaceRepository(session)
        self.repository = ProjectRepository(session)

    def _workspace(self, workspace_id: str) -> WorkspaceModel:
        workspace = self.workspaces.get(workspace_id)
        if workspace is None:
            raise EntityNotFound("Workspace not found")
        return workspace

    def list(self, workspace_id: str, search: str | None, status: str | None) -> list[ProjectModel]:
        self._workspace(workspace_id)
        return list(self.repository.list(workspace_id, search, status))

    def get(self, workspace_id: str, project_id: str) -> ProjectModel:
        self._workspace(workspace_id)
        project = self.repository.get(workspace_id, project_id)
        if project is None:
            raise EntityNotFound("Project not found")
        return project

    def create(self, workspace_id: str, name: str, description: str | None) -> ProjectModel:
        self._workspace(workspace_id)
        clean = clean_name(name)
        if self.repository.find_by_name(workspace_id, clean) is not None:
            raise DuplicateName("A project with this name already exists in this workspace")
        project = ProjectModel(
            workspace_id=workspace_id,
            name=clean,
            description=clean_description(description),
            status=ProjectStatus.ACTIVE.value,
        )
        self.session.add(project)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise DuplicateName(
                "A project with this name already exists in this workspace"
            ) from exc
        self.session.refresh(project)
        return project

    def update(
        self,
        workspace_id: str,
        project_id: str,
        name: str | None,
        description: str | None,
    ) -> ProjectModel:
        project = self.get(workspace_id, project_id)
        if name is not None:
            clean = clean_name(name)
            duplicate = self.repository.find_by_name(workspace_id, clean)
            if duplicate is not None and duplicate.id != project_id:
                raise DuplicateName("A project with this name already exists in this workspace")
            project.name = clean
        if description is not None:
            project.description = clean_description(description)
        project.updated_at = now()
        self.session.commit()
        self.session.refresh(project)
        return project

    def set_status(self, workspace_id: str, project_id: str, status: ProjectStatus) -> ProjectModel:
        project = self.get(workspace_id, project_id)
        project.status = status.value
        project.archived_at = now() if status == ProjectStatus.ARCHIVED else None
        project.updated_at = now()
        self.session.commit()
        self.session.refresh(project)
        return project


def clean_title(value: str) -> str:
    title = value.strip()
    if not title:
        raise InvalidInput("Title is required")
    if len(title) > 160:
        raise InvalidInput("Title must be 160 characters or fewer")
    return title


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


class PlanningService:
    """Application operations for the FND-02 planning slice.

    Every operation resolves the project through the workspace-scoped lookup before
    touching a child record. This keeps IDs useful without allowing cross-workspace
    or cross-project reads and writes.
    """

    def __init__(self, session: Session) -> None:
        self.session = session
        self.projects = ProjectRepository(session)

    def project(self, workspace_id: str, project_id: str) -> ProjectModel:
        project = self.projects.get(workspace_id, project_id)
        if project is None:
            raise EntityNotFound("Project not found")
        return project

    def writable_project(self, workspace_id: str, project_id: str) -> ProjectModel:
        project = self.project(workspace_id, project_id)
        if project.status == ProjectStatus.ARCHIVED.value:
            raise InvalidInput("Archived projects are read-only")
        return project

    def _epic(self, project_id: str, epic_id: str) -> EpicModel:
        epic = self.session.scalar(
            select(EpicModel).where(EpicModel.id == epic_id, EpicModel.project_id == project_id)
        )
        if epic is None:
            raise EntityNotFound("Epic not found")
        return epic

    def _feature(self, project_id: str, feature_id: str) -> FeatureModel:
        feature = self.session.scalar(
            select(FeatureModel).where(
                FeatureModel.id == feature_id, FeatureModel.project_id == project_id
            )
        )
        if feature is None:
            raise EntityNotFound("Feature not found")
        return feature

    def _task(self, feature_id: str, task_id: str) -> TaskModel:
        task = self.session.scalar(
            select(TaskModel).where(TaskModel.id == task_id, TaskModel.feature_id == feature_id)
        )
        if task is None:
            raise EntityNotFound("Task not found")
        return task

    def _criterion(self, feature_id: str, criterion_id: str) -> AcceptanceCriterionModel:
        criterion = self.session.scalar(
            select(AcceptanceCriterionModel).where(
                AcceptanceCriterionModel.id == criterion_id,
                AcceptanceCriterionModel.feature_id == feature_id,
            )
        )
        if criterion is None:
            raise EntityNotFound("Acceptance criterion not found")
        return criterion

    def list_epics(self, workspace_id: str, project_id: str) -> list[EpicModel]:
        self.project(workspace_id, project_id)
        return list(
            self.session.scalars(
                select(EpicModel)
                .where(EpicModel.project_id == project_id)
                .order_by(EpicModel.updated_at.desc(), EpicModel.title)
            ).all()
        )

    def create_epic(
        self, workspace_id: str, project_id: str, title: str, description: str | None
    ) -> EpicModel:
        self.writable_project(workspace_id, project_id)
        epic = EpicModel(
            project_id=project_id,
            title=clean_title(title),
            description=clean_text(description),
            status=EpicStatus.PLANNING.value,
        )
        self.session.add(epic)
        self.session.commit()
        self.session.refresh(epic)
        return epic

    def get_epic(self, workspace_id: str, project_id: str, epic_id: str) -> EpicModel:
        self.project(workspace_id, project_id)
        return self._epic(project_id, epic_id)

    def update_epic(
        self,
        workspace_id: str,
        project_id: str,
        epic_id: str,
        title: str | None,
        description: str | None,
        status: EpicStatus | None,
    ) -> EpicModel:
        self.writable_project(workspace_id, project_id)
        epic = self._epic(project_id, epic_id)
        if title is not None:
            epic.title = clean_title(title)
        if description is not None:
            epic.description = clean_text(description)
        if status is not None:
            epic.status = status.value
        epic.updated_at = now()
        self.session.commit()
        self.session.refresh(epic)
        return epic

    def list_features(
        self,
        workspace_id: str,
        project_id: str,
        search: str | None,
        status: FeatureStatus | None,
        priority: FeaturePriority | None,
        epic_id: str | None,
    ) -> list[FeatureModel]:
        self.project(workspace_id, project_id)
        query = select(FeatureModel).where(FeatureModel.project_id == project_id)
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            query = query.where(
                FeatureModel.title.ilike(pattern)
                | FeatureModel.description.ilike(pattern)
                | FeatureModel.goal.ilike(pattern)
            )
        if status is not None:
            query = query.where(FeatureModel.status == status.value)
        if priority is not None:
            query = query.where(FeatureModel.priority == priority.value)
        if epic_id is not None:
            if epic_id != "unassigned":
                self._epic(project_id, epic_id)
                query = query.where(FeatureModel.epic_id == epic_id)
            else:
                query = query.where(FeatureModel.epic_id.is_(None))
        return list(
            self.session.scalars(
                query.order_by(FeatureModel.updated_at.desc(), FeatureModel.readable_id)
            ).all()
        )

    def _next_feature_id(self, project_id: str) -> str:
        values = self.session.scalars(
            select(FeatureModel.readable_id).where(FeatureModel.project_id == project_id)
        ).all()
        numbers = [
            int(value.removeprefix("FEAT-"))
            for value in values
            if value.startswith("FEAT-") and value[5:].isdigit()
        ]
        return f"FEAT-{max(numbers, default=0) + 1:03d}"

    def create_feature(
        self,
        workspace_id: str,
        project_id: str,
        title: str,
        description: str | None,
        goal: str | None,
        priority: FeaturePriority,
        status: FeatureStatus,
        epic_id: str | None,
    ) -> FeatureModel:
        self.writable_project(workspace_id, project_id)
        if epic_id is not None:
            self._epic(project_id, epic_id)
        feature = FeatureModel(
            project_id=project_id,
            epic_id=epic_id,
            readable_id=self._next_feature_id(project_id),
            title=clean_title(title),
            description=clean_text(description),
            goal=clean_text(goal),
            priority=priority.value,
            status=status.value,
        )
        self.session.add(feature)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise InvalidInput("Could not allocate a unique feature ID") from exc
        self.session.refresh(feature)
        return feature

    def get_feature(self, workspace_id: str, project_id: str, feature_id: str) -> FeatureModel:
        self.project(workspace_id, project_id)
        return self._feature(project_id, feature_id)

    def update_feature(
        self,
        workspace_id: str,
        project_id: str,
        feature_id: str,
        title: str | None,
        description: str | None,
        goal: str | None,
        priority: FeaturePriority | None,
        status: FeatureStatus | None,
        epic_id: str | None,
        clear_epic: bool = False,
    ) -> FeatureModel:
        self.writable_project(workspace_id, project_id)
        feature = self._feature(project_id, feature_id)
        if title is not None:
            feature.title = clean_title(title)
        if description is not None:
            feature.description = clean_text(description)
        if goal is not None:
            feature.goal = clean_text(goal)
        if priority is not None:
            feature.priority = priority.value
        if status is not None:
            feature.status = status.value
        if clear_epic:
            feature.epic_id = None
        elif epic_id is not None:
            self._epic(project_id, epic_id)
            feature.epic_id = epic_id
        feature.updated_at = now()
        self.session.commit()
        self.session.refresh(feature)
        return feature

    def list_tasks(self, workspace_id: str, project_id: str, feature_id: str) -> list[TaskModel]:
        self.project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        return list(
            self.session.scalars(
                select(TaskModel)
                .where(TaskModel.feature_id == feature_id)
                .order_by(TaskModel.position, TaskModel.created_at)
            ).all()
        )

    def create_task(
        self,
        workspace_id: str,
        project_id: str,
        feature_id: str,
        title: str,
        description: str | None,
        status: TaskStatus,
        position: int | None,
    ) -> TaskModel:
        self.writable_project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        next_position = self.session.scalar(
            select(func.max(TaskModel.position)).where(TaskModel.feature_id == feature_id)
        )
        task = TaskModel(
            feature_id=feature_id,
            title=clean_title(title),
            description=clean_text(description),
            status=status.value,
            position=max(
                0,
                position
                if position is not None
                else (next_position if next_position is not None else -1) + 1,
            ),
        )
        self.session.add(task)
        self.session.commit()
        self.session.refresh(task)
        return task

    def update_task(
        self,
        workspace_id: str,
        project_id: str,
        feature_id: str,
        task_id: str,
        title: str | None,
        description: str | None,
        status: TaskStatus | None,
        position: int | None,
    ) -> TaskModel:
        self.writable_project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        task = self._task(feature_id, task_id)
        if title is not None:
            task.title = clean_title(title)
        if description is not None:
            task.description = clean_text(description)
        if status is not None:
            task.status = status.value
        if position is not None:
            task.position = max(0, position)
        task.updated_at = now()
        self.session.commit()
        self.session.refresh(task)
        return task

    def reorder_tasks(
        self, workspace_id: str, project_id: str, feature_id: str, task_ids: list[str]
    ) -> list[TaskModel]:
        self.writable_project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        tasks = list(
            self.session.scalars(select(TaskModel).where(TaskModel.feature_id == feature_id)).all()
        )
        if set(task_ids) != {task.id for task in tasks} or len(task_ids) != len(tasks):
            raise InvalidInput("Reorder must include every task exactly once")
        by_id = {task.id: task for task in tasks}
        for position, task_id in enumerate(task_ids):
            by_id[task_id].position = position
            by_id[task_id].updated_at = now()
        self.session.commit()
        return list(
            self.session.scalars(
                select(TaskModel)
                .where(TaskModel.feature_id == feature_id)
                .order_by(TaskModel.position)
            ).all()
        )

    def list_criteria(
        self, workspace_id: str, project_id: str, feature_id: str
    ) -> list[AcceptanceCriterionModel]:
        self.project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        return list(
            self.session.scalars(
                select(AcceptanceCriterionModel)
                .where(AcceptanceCriterionModel.feature_id == feature_id)
                .order_by(AcceptanceCriterionModel.position, AcceptanceCriterionModel.created_at)
            ).all()
        )

    def create_criterion(
        self,
        workspace_id: str,
        project_id: str,
        feature_id: str,
        description: str,
        satisfied: bool,
        position: int | None,
    ) -> AcceptanceCriterionModel:
        self.writable_project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        description_clean = clean_text(description)
        if description_clean is None:
            raise InvalidInput("Acceptance criterion description is required")
        next_position = self.session.scalar(
            select(func.max(AcceptanceCriterionModel.position)).where(
                AcceptanceCriterionModel.feature_id == feature_id
            )
        )
        criterion = AcceptanceCriterionModel(
            feature_id=feature_id,
            description=description_clean,
            satisfied=satisfied,
            position=max(
                0,
                position
                if position is not None
                else (next_position if next_position is not None else -1) + 1,
            ),
        )
        self.session.add(criterion)
        self.session.commit()
        self.session.refresh(criterion)
        return criterion

    def update_criterion(
        self,
        workspace_id: str,
        project_id: str,
        feature_id: str,
        criterion_id: str,
        description: str | None,
        satisfied: bool | None,
        position: int | None,
    ) -> AcceptanceCriterionModel:
        self.writable_project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        criterion = self._criterion(feature_id, criterion_id)
        if description is not None:
            description_clean = clean_text(description)
            if description_clean is None:
                raise InvalidInput("Acceptance criterion description is required")
            criterion.description = description_clean
        if satisfied is not None:
            criterion.satisfied = satisfied
        if position is not None:
            criterion.position = max(0, position)
        criterion.updated_at = now()
        self.session.commit()
        self.session.refresh(criterion)
        return criterion

    def reorder_criteria(
        self, workspace_id: str, project_id: str, feature_id: str, criterion_ids: list[str]
    ) -> list[AcceptanceCriterionModel]:
        self.writable_project(workspace_id, project_id)
        self._feature(project_id, feature_id)
        criteria = list(
            self.session.scalars(
                select(AcceptanceCriterionModel).where(
                    AcceptanceCriterionModel.feature_id == feature_id
                )
            ).all()
        )
        if set(criterion_ids) != {criterion.id for criterion in criteria} or len(
            criterion_ids
        ) != len(criteria):
            raise InvalidInput("Reorder must include every acceptance criterion exactly once")
        by_id = {criterion.id: criterion for criterion in criteria}
        for position, criterion_id in enumerate(criterion_ids):
            by_id[criterion_id].position = position
            by_id[criterion_id].updated_at = now()
        self.session.commit()
        return list(
            self.session.scalars(
                select(AcceptanceCriterionModel)
                .where(AcceptanceCriterionModel.feature_id == feature_id)
                .order_by(AcceptanceCriterionModel.position)
            ).all()
        )

    def list_dependencies(self, workspace_id: str, project_id: str) -> list[FeatureDependencyModel]:
        self.project(workspace_id, project_id)
        return list(
            self.session.scalars(
                select(FeatureDependencyModel)
                .where(FeatureDependencyModel.project_id == project_id)
                .order_by(FeatureDependencyModel.created_at)
            ).all()
        )

    def create_dependency(
        self,
        workspace_id: str,
        project_id: str,
        blocking_feature_id: str,
        blocked_feature_id: str,
    ) -> FeatureDependencyModel:
        self.writable_project(workspace_id, project_id)
        if blocking_feature_id == blocked_feature_id:
            raise InvalidInput("A feature cannot depend on itself")
        self._feature(project_id, blocking_feature_id)
        self._feature(project_id, blocked_feature_id)
        existing = self.session.scalar(
            select(FeatureDependencyModel).where(
                FeatureDependencyModel.project_id == project_id,
                FeatureDependencyModel.blocking_feature_id == blocking_feature_id,
                FeatureDependencyModel.blocked_feature_id == blocked_feature_id,
            )
        )
        if existing is not None:
            raise DuplicateName("This feature dependency already exists")
        edges = self.session.execute(
            select(
                FeatureDependencyModel.blocking_feature_id,
                FeatureDependencyModel.blocked_feature_id,
            ).where(FeatureDependencyModel.project_id == project_id)
        ).all()
        graph: dict[str, set[str]] = {}
        for edge_blocking, edge_blocked in edges:
            graph.setdefault(edge_blocked, set()).add(edge_blocking)
        graph.setdefault(blocked_feature_id, set()).add(blocking_feature_id)
        pending = [blocking_feature_id]
        visited: set[str] = set()
        while pending:
            current = pending.pop()
            if current == blocked_feature_id:
                raise InvalidInput("This dependency would create a cycle")
            if current in visited:
                continue
            visited.add(current)
            pending.extend(graph.get(current, set()))
        dependency = FeatureDependencyModel(
            project_id=project_id,
            blocking_feature_id=blocking_feature_id,
            blocked_feature_id=blocked_feature_id,
        )
        self.session.add(dependency)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise DuplicateName("This feature dependency already exists") from exc
        self.session.refresh(dependency)
        return dependency

    def delete_dependency(self, workspace_id: str, project_id: str, dependency_id: str) -> None:
        self.writable_project(workspace_id, project_id)
        dependency = self.session.scalar(
            select(FeatureDependencyModel).where(
                FeatureDependencyModel.id == dependency_id,
                FeatureDependencyModel.project_id == project_id,
            )
        )
        if dependency is None:
            raise EntityNotFound("Feature dependency not found")
        self.session.delete(dependency)
        self.session.commit()

    def overview(self, workspace_id: str, project_id: str) -> dict[str, int]:
        self.project(workspace_id, project_id)
        features = list(
            self.session.scalars(
                select(FeatureModel).where(FeatureModel.project_id == project_id)
            ).all()
        )
        return {
            "epics": int(
                self.session.scalar(
                    select(func.count(EpicModel.id)).where(EpicModel.project_id == project_id)
                )
                or 0
            ),
            "features": len(features),
            "tasks": int(
                self.session.scalar(
                    select(func.count(TaskModel.id))
                    .join(FeatureModel)
                    .where(FeatureModel.project_id == project_id)
                )
                or 0
            ),
            "acceptance_criteria": int(
                self.session.scalar(
                    select(func.count(AcceptanceCriterionModel.id))
                    .join(FeatureModel)
                    .where(FeatureModel.project_id == project_id)
                )
                or 0
            ),
            "satisfied_criteria": int(
                self.session.scalar(
                    select(func.count(AcceptanceCriterionModel.id))
                    .join(FeatureModel)
                    .where(
                        FeatureModel.project_id == project_id,
                        AcceptanceCriterionModel.satisfied.is_(True),
                    )
                )
                or 0
            ),
            "dependencies": int(
                self.session.scalar(
                    select(func.count(FeatureDependencyModel.id)).where(
                        FeatureDependencyModel.project_id == project_id
                    )
                )
                or 0
            ),
        }
