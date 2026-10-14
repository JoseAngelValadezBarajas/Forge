from collections.abc import Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.persistence.models import ProjectModel, WorkspaceModel


class WorkspaceRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self) -> Sequence[WorkspaceModel]:
        return self.session.scalars(select(WorkspaceModel).order_by(WorkspaceModel.name)).all()

    def get(self, workspace_id: str) -> WorkspaceModel | None:
        return self.session.get(WorkspaceModel, workspace_id)

    def find_by_name(self, name: str) -> WorkspaceModel | None:
        return self.session.scalar(
            select(WorkspaceModel).where(func.lower(WorkspaceModel.name) == name.lower())
        )


class ProjectRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(
        self, workspace_id: str, search: str | None = None, status: str | None = None
    ) -> Sequence[ProjectModel]:
        query = select(ProjectModel).where(ProjectModel.workspace_id == workspace_id)
        if status and status != "all":
            query = query.where(ProjectModel.status == status)
        if search:
            pattern = f"%{search.strip()}%"
            query = query.where(
                or_(ProjectModel.name.ilike(pattern), ProjectModel.description.ilike(pattern))
            )
        return self.session.scalars(query.order_by(ProjectModel.updated_at.desc())).all()

    def get(self, workspace_id: str, project_id: str) -> ProjectModel | None:
        return self.session.scalar(
            select(ProjectModel).where(
                ProjectModel.id == project_id, ProjectModel.workspace_id == workspace_id
            )
        )

    def find_by_name(self, workspace_id: str, name: str) -> ProjectModel | None:
        return self.session.scalar(
            select(ProjectModel).where(
                ProjectModel.workspace_id == workspace_id,
                func.lower(ProjectModel.name) == name.lower(),
            )
        )
