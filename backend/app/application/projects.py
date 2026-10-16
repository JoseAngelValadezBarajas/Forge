"""Project application use cases."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.common.errors import DuplicateName, EntityNotFound
from app.application.common.validation import clean_description, clean_name, now
from app.domain.entities import ProjectStatus
from app.persistence.models import ProjectModel, WorkspaceModel
from app.persistence.repositories import ProjectRepository, WorkspaceRepository


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
