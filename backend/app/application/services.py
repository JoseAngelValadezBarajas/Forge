from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.entities import ProjectStatus
from app.persistence.models import ProjectModel, WorkspaceModel
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
