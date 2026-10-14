from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.schemas import (
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from app.application.services import (
    DuplicateName,
    EntityNotFound,
    InvalidInput,
    ProjectService,
    WorkspaceService,
)
from app.config import get_settings
from app.db import get_db
from app.domain.entities import ProjectStatus

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


def _service_error(exc: Exception) -> HTTPException:
    if isinstance(exc, EntityNotFound):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, DuplicateName):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, InvalidInput):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(status_code=500, detail="Internal server error")


@router.get("/workspaces", response_model=list[WorkspaceResponse])
def list_workspaces(db: Session = Depends(get_db)) -> list[WorkspaceResponse]:
    return [WorkspaceResponse.model_validate(item) for item in WorkspaceService(db).list()]


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreate, db: Session = Depends(get_db)
) -> WorkspaceResponse:
    try:
        workspace = WorkspaceService(db).create(payload.name, payload.description)
    except (DuplicateName, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return WorkspaceResponse.model_validate(workspace)


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(workspace_id: str, db: Session = Depends(get_db)) -> WorkspaceResponse:
    try:
        workspace = WorkspaceService(db).get(workspace_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return WorkspaceResponse.model_validate(workspace)


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace(
    workspace_id: str, payload: WorkspaceUpdate, db: Session = Depends(get_db)
) -> WorkspaceResponse:
    try:
        workspace = WorkspaceService(db).update(
            workspace_id, payload.name, payload.description
        )
    except (DuplicateName, EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return WorkspaceResponse.model_validate(workspace)


@router.get(
    "/workspaces/{workspace_id}/projects", response_model=list[ProjectResponse]
)
def list_projects(
    workspace_id: str,
    search: str | None = Query(default=None, max_length=120),
    status_filter: Literal["active", "archived", "all"] = Query(
        default="active", alias="status"
    ),
    db: Session = Depends(get_db),
) -> list[ProjectResponse]:
    try:
        projects = ProjectService(db).list(workspace_id, search, status_filter)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [ProjectResponse.model_validate(item) for item in projects]


@router.post(
    "/workspaces/{workspace_id}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    workspace_id: str, payload: ProjectCreate, db: Session = Depends(get_db)
) -> ProjectResponse:
    try:
        project = ProjectService(db).create(workspace_id, payload.name, payload.description)
    except (DuplicateName, EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return ProjectResponse.model_validate(project)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}", response_model=ProjectResponse
)
def get_project(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> ProjectResponse:
    try:
        project = ProjectService(db).get(workspace_id, project_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return ProjectResponse.model_validate(project)


@router.patch(
    "/workspaces/{workspace_id}/projects/{project_id}", response_model=ProjectResponse
)
def update_project(
    workspace_id: str,
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
) -> ProjectResponse:
    try:
        project = ProjectService(db).update(
            workspace_id, project_id, payload.name, payload.description
        )
    except (DuplicateName, EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return ProjectResponse.model_validate(project)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/archive", response_model=ProjectResponse
)
def archive_project(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> ProjectResponse:
    try:
        project = ProjectService(db).set_status(
            workspace_id, project_id, ProjectStatus.ARCHIVED
        )
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return ProjectResponse.model_validate(project)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/restore", response_model=ProjectResponse
)
def restore_project(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> ProjectResponse:
    try:
        project = ProjectService(db).set_status(
            workspace_id, project_id, ProjectStatus.ACTIVE
        )
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return ProjectResponse.model_validate(project)

