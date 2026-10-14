from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.schemas import (
    AcceptanceCriterionCreate,
    AcceptanceCriterionResponse,
    AcceptanceCriterionUpdate,
    DependencyCreate,
    DependencyResponse,
    EpicCreate,
    EpicResponse,
    EpicUpdate,
    FeatureCreate,
    FeatureResponse,
    FeatureUpdate,
    ProjectCreate,
    ProjectPlanningOverview,
    ProjectResponse,
    ProjectUpdate,
    ReorderRequest,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from app.application.services import (
    DuplicateName,
    EntityNotFound,
    InvalidInput,
    PlanningService,
    ProjectService,
    WorkspaceService,
)
from app.config import get_settings
from app.db import get_db
from app.domain.entities import (
    FeaturePriority,
    FeatureStatus,
    ProjectStatus,
)

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
def create_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db)) -> WorkspaceResponse:
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
        workspace = WorkspaceService(db).update(workspace_id, payload.name, payload.description)
    except (DuplicateName, EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return WorkspaceResponse.model_validate(workspace)


@router.get("/workspaces/{workspace_id}/projects", response_model=list[ProjectResponse])
def list_projects(
    workspace_id: str,
    search: str | None = Query(default=None, max_length=120),
    status_filter: Literal["active", "archived", "all"] = Query(default="active", alias="status"),
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


@router.get("/workspaces/{workspace_id}/projects/{project_id}", response_model=ProjectResponse)
def get_project(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> ProjectResponse:
    try:
        project = ProjectService(db).get(workspace_id, project_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return ProjectResponse.model_validate(project)


@router.patch("/workspaces/{workspace_id}/projects/{project_id}", response_model=ProjectResponse)
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
        project = ProjectService(db).set_status(workspace_id, project_id, ProjectStatus.ARCHIVED)
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
        project = ProjectService(db).set_status(workspace_id, project_id, ProjectStatus.ACTIVE)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return ProjectResponse.model_validate(project)


def _planning(workspace_id: str, project_id: str, db: Session) -> PlanningService:
    service = PlanningService(db)
    service.project(workspace_id, project_id)
    return service


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/planning/overview",
    response_model=ProjectPlanningOverview,
)
def project_planning_overview(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> ProjectPlanningOverview:
    try:
        return ProjectPlanningOverview(**PlanningService(db).overview(workspace_id, project_id))
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/epics",
    response_model=list[EpicResponse],
)
def list_epics(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> list[EpicResponse]:
    try:
        return [
            EpicResponse.model_validate(item)
            for item in PlanningService(db).list_epics(workspace_id, project_id)
        ]
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/epics",
    response_model=EpicResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_epic(
    workspace_id: str,
    project_id: str,
    payload: EpicCreate,
    db: Session = Depends(get_db),
) -> EpicResponse:
    try:
        epic = PlanningService(db).create_epic(
            workspace_id, project_id, payload.title, payload.description
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return EpicResponse.model_validate(epic)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/epics/{epic_id}",
    response_model=EpicResponse,
)
def get_epic(
    workspace_id: str, project_id: str, epic_id: str, db: Session = Depends(get_db)
) -> EpicResponse:
    try:
        return EpicResponse.model_validate(
            PlanningService(db).get_epic(workspace_id, project_id, epic_id)
        )
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.patch(
    "/workspaces/{workspace_id}/projects/{project_id}/epics/{epic_id}",
    response_model=EpicResponse,
)
def update_epic(
    workspace_id: str,
    project_id: str,
    epic_id: str,
    payload: EpicUpdate,
    db: Session = Depends(get_db),
) -> EpicResponse:
    try:
        epic = PlanningService(db).update_epic(
            workspace_id,
            project_id,
            epic_id,
            payload.title,
            payload.description,
            payload.status,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return EpicResponse.model_validate(epic)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features",
    response_model=list[FeatureResponse],
)
def list_features(
    workspace_id: str,
    project_id: str,
    search: str | None = Query(default=None, max_length=160),
    status_filter: FeatureStatus | None = Query(default=None, alias="status"),
    priority: FeaturePriority | None = None,
    epic_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[FeatureResponse]:
    try:
        features = PlanningService(db).list_features(
            workspace_id, project_id, search, status_filter, priority, epic_id
        )
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [FeatureResponse.model_validate(item) for item in features]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features",
    response_model=FeatureResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_feature(
    workspace_id: str,
    project_id: str,
    payload: FeatureCreate,
    db: Session = Depends(get_db),
) -> FeatureResponse:
    try:
        feature = PlanningService(db).create_feature(
            workspace_id,
            project_id,
            payload.title,
            payload.description,
            payload.goal,
            payload.priority,
            payload.status,
            payload.epic_id,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return FeatureResponse.model_validate(feature)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}",
    response_model=FeatureResponse,
)
def get_feature(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> FeatureResponse:
    try:
        return FeatureResponse.model_validate(
            PlanningService(db).get_feature(workspace_id, project_id, feature_id)
        )
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.patch(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}",
    response_model=FeatureResponse,
)
def update_feature(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    payload: FeatureUpdate,
    db: Session = Depends(get_db),
) -> FeatureResponse:
    try:
        feature = PlanningService(db).update_feature(
            workspace_id,
            project_id,
            feature_id,
            payload.title,
            payload.description,
            payload.goal,
            payload.priority,
            payload.status,
            payload.epic_id,
            payload.clear_epic,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return FeatureResponse.model_validate(feature)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/tasks",
    response_model=list[TaskResponse],
)
def list_tasks(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> list[TaskResponse]:
    try:
        tasks = PlanningService(db).list_tasks(workspace_id, project_id, feature_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [TaskResponse.model_validate(item) for item in tasks]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    payload: TaskCreate,
    db: Session = Depends(get_db),
) -> TaskResponse:
    try:
        task = PlanningService(db).create_task(
            workspace_id,
            project_id,
            feature_id,
            payload.title,
            payload.description,
            payload.status,
            payload.position,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return TaskResponse.model_validate(task)


@router.patch(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/tasks/{task_id}",
    response_model=TaskResponse,
)
def update_task(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    task_id: str,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
) -> TaskResponse:
    try:
        task = PlanningService(db).update_task(
            workspace_id,
            project_id,
            feature_id,
            task_id,
            payload.title,
            payload.description,
            payload.status,
            payload.position,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return TaskResponse.model_validate(task)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/tasks/reorder",
    response_model=list[TaskResponse],
)
def reorder_tasks(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    payload: ReorderRequest,
    db: Session = Depends(get_db),
) -> list[TaskResponse]:
    try:
        tasks = PlanningService(db).reorder_tasks(workspace_id, project_id, feature_id, payload.ids)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return [TaskResponse.model_validate(item) for item in tasks]


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/acceptance-criteria",
    response_model=list[AcceptanceCriterionResponse],
)
def list_acceptance_criteria(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> list[AcceptanceCriterionResponse]:
    try:
        criteria = PlanningService(db).list_criteria(workspace_id, project_id, feature_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [AcceptanceCriterionResponse.model_validate(item) for item in criteria]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/acceptance-criteria",
    response_model=AcceptanceCriterionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_acceptance_criterion(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    payload: AcceptanceCriterionCreate,
    db: Session = Depends(get_db),
) -> AcceptanceCriterionResponse:
    try:
        criterion = PlanningService(db).create_criterion(
            workspace_id,
            project_id,
            feature_id,
            payload.description,
            payload.satisfied,
            payload.position,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return AcceptanceCriterionResponse.model_validate(criterion)


@router.patch(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/acceptance-criteria/{criterion_id}",
    response_model=AcceptanceCriterionResponse,
)
def update_acceptance_criterion(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    criterion_id: str,
    payload: AcceptanceCriterionUpdate,
    db: Session = Depends(get_db),
) -> AcceptanceCriterionResponse:
    try:
        criterion = PlanningService(db).update_criterion(
            workspace_id,
            project_id,
            feature_id,
            criterion_id,
            payload.description,
            payload.satisfied,
            payload.position,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return AcceptanceCriterionResponse.model_validate(criterion)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/acceptance-criteria/reorder",
    response_model=list[AcceptanceCriterionResponse],
)
def reorder_acceptance_criteria(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    payload: ReorderRequest,
    db: Session = Depends(get_db),
) -> list[AcceptanceCriterionResponse]:
    try:
        criteria = PlanningService(db).reorder_criteria(
            workspace_id, project_id, feature_id, payload.ids
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return [AcceptanceCriterionResponse.model_validate(item) for item in criteria]


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/dependencies",
    response_model=list[DependencyResponse],
)
def list_dependencies(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> list[DependencyResponse]:
    try:
        dependencies = PlanningService(db).list_dependencies(workspace_id, project_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [DependencyResponse.model_validate(item) for item in dependencies]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/dependencies",
    response_model=DependencyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_dependency(
    workspace_id: str,
    project_id: str,
    payload: DependencyCreate,
    db: Session = Depends(get_db),
) -> DependencyResponse:
    try:
        dependency = PlanningService(db).create_dependency(
            workspace_id,
            project_id,
            payload.blocking_feature_id,
            payload.blocked_feature_id,
        )
    except (DuplicateName, EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return DependencyResponse.model_validate(dependency)


@router.delete(
    "/workspaces/{workspace_id}/projects/{project_id}/dependencies/{dependency_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_dependency(
    workspace_id: str, project_id: str, dependency_id: str, db: Session = Depends(get_db)
) -> None:
    try:
        PlanningService(db).delete_dependency(workspace_id, project_id, dependency_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
