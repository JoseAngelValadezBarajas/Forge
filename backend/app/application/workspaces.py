"""Workspace application use cases."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.common.errors import DuplicateName, EntityNotFound
from app.application.common.validation import clean_description, clean_name, now
from app.persistence.models import WorkspaceModel
from app.persistence.repositories import WorkspaceRepository


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
