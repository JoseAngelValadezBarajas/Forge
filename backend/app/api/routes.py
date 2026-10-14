import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import (
    AcceptanceCriterionCreate,
    AcceptanceCriterionResponse,
    AcceptanceCriterionUpdate,
    ApplicableInvariantResponse,
    DecisionCreate,
    DecisionResponse,
    DecisionRevisionResponse,
    DecisionUpdate,
    DependencyCreate,
    DependencyResponse,
    EpicCreate,
    EpicResponse,
    EpicUpdate,
    FeatureCreate,
    FeatureResponse,
    FeatureUpdate,
    InvariantAcknowledgementRequest,
    InvariantAcknowledgementResponse,
    InvariantCreate,
    InvariantResponse,
    InvariantRevisionResponse,
    InvariantUpdate,
    ProjectCreate,
    ProjectPlanningOverview,
    ProjectResponse,
    ProjectUpdate,
    ReadinessEvaluationResponse,
    ReorderRequest,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from app.application.decisions import DecisionService
from app.application.invariants import InvariantService
from app.application.readiness import ReadinessEngine
from app.application.services import (
    DuplicateName,
    EntityNotFound,
    InvalidInput,
    PlanningService,
    ProjectService,
    RevisionConflict,
    WorkspaceService,
)
from app.config import get_settings
from app.db import get_db
from app.domain.entities import (
    FeaturePriority,
    FeatureStatus,
    ProjectStatus,
    ReadinessOutcome,
)
from app.persistence.models import ReadinessEvaluationModel

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
    if isinstance(exc, RevisionConflict):
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


def _readiness_response(
    evaluation: object,
    evaluation_id: str | None = None,
    stale: bool = False,
) -> ReadinessEvaluationResponse:
    data = evaluation
    return ReadinessEvaluationResponse(
        evaluation_id=evaluation_id,
        feature_id=data.feature_id,  # type: ignore[attr-defined]
        evaluated_at=data.evaluated_at,  # type: ignore[attr-defined]
        rule_set_version=data.rule_set_version,  # type: ignore[attr-defined]
        input_fingerprint=data.input_fingerprint,  # type: ignore[attr-defined]
        outcome=data.outcome.value,  # type: ignore[attr-defined]
        passed_checks=data.passed_checks,  # type: ignore[attr-defined]
        failed_checks=data.failed_checks,  # type: ignore[attr-defined]
        blockers=data.blockers,  # type: ignore[attr-defined]
        results=data.results,  # type: ignore[attr-defined]
        stale=stale,
    )


def _stored_readiness_response(
    evaluation: ReadinessEvaluationModel,
    project: object,
    feature: object,
    db: Session,
) -> ReadinessEvaluationResponse:
    from app.application.readiness import ReadinessEvaluation

    stored = json.loads(evaluation.results_json)
    current_fingerprint = ReadinessEngine(db).fingerprint(project, feature)  # type: ignore[arg-type]
    snapshot = ReadinessEvaluation(
        feature_id=evaluation.feature_id,
        evaluated_at=evaluation.evaluated_at,
        rule_set_version=evaluation.rule_set_version,
        input_fingerprint=evaluation.input_fingerprint,
        outcome=ReadinessOutcome(stored["outcome"]),
        passed_checks=stored["passed_checks"],
        failed_checks=stored["failed_checks"],
        blockers=stored["blockers"],
        results=stored["results"],
        input_snapshot=json.loads(evaluation.input_snapshot_json),
    )
    return _readiness_response(
        snapshot,
        evaluation.id,
        stale=current_fingerprint != evaluation.input_fingerprint,
    )


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/decisions",
    response_model=list[DecisionResponse],
)
def list_decisions(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> list[DecisionResponse]:
    try:
        return [
            DecisionResponse.model_validate(item)
            for item in DecisionService(db).list_decisions(workspace_id, project_id)
        ]
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/decisions",
    response_model=DecisionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_decision(
    workspace_id: str,
    project_id: str,
    payload: DecisionCreate,
    db: Session = Depends(get_db),
) -> DecisionResponse:
    try:
        decision = DecisionService(db).create(
            workspace_id,
            project_id,
            payload.title,
            payload.context,
            payload.decision,
            payload.rationale,
            payload.alternatives_considered,
            payload.tradeoffs,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return DecisionResponse.model_validate(decision)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/decisions/{decision_id}",
    response_model=DecisionResponse,
)
def get_decision(
    workspace_id: str, project_id: str, decision_id: str, db: Session = Depends(get_db)
) -> DecisionResponse:
    try:
        return DecisionResponse.model_validate(
            DecisionService(db).get(workspace_id, project_id, decision_id)
        )
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.patch(
    "/workspaces/{workspace_id}/projects/{project_id}/decisions/{decision_id}",
    response_model=DecisionResponse,
)
def update_decision(
    workspace_id: str,
    project_id: str,
    decision_id: str,
    payload: DecisionUpdate,
    db: Session = Depends(get_db),
) -> DecisionResponse:
    try:
        decision = DecisionService(db).update(
            workspace_id,
            project_id,
            decision_id,
            payload.title,
            payload.context,
            payload.decision,
            payload.rationale,
            payload.alternatives_considered,
            payload.tradeoffs,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return DecisionResponse.model_validate(decision)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/decisions/{decision_id}/accept",
    response_model=DecisionResponse,
)
def accept_decision(
    workspace_id: str, project_id: str, decision_id: str, db: Session = Depends(get_db)
) -> DecisionResponse:
    try:
        decision = DecisionService(db).accept(workspace_id, project_id, decision_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return DecisionResponse.model_validate(decision)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/decisions/{decision_id}/supersede",
    response_model=DecisionResponse,
    status_code=status.HTTP_201_CREATED,
)
def supersede_decision(
    workspace_id: str,
    project_id: str,
    decision_id: str,
    payload: DecisionCreate,
    db: Session = Depends(get_db),
) -> DecisionResponse:
    try:
        _previous, successor = DecisionService(db).supersede(
            workspace_id,
            project_id,
            decision_id,
            payload.title,
            payload.context,
            payload.decision,
            payload.rationale,
            payload.alternatives_considered,
            payload.tradeoffs,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return DecisionResponse.model_validate(successor)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/decisions/{decision_id}/revisions",
    response_model=list[DecisionRevisionResponse],
)
def decision_revisions(
    workspace_id: str, project_id: str, decision_id: str, db: Session = Depends(get_db)
) -> list[DecisionRevisionResponse]:
    try:
        return [
            DecisionRevisionResponse.model_validate(item)
            for item in DecisionService(db).revisions(workspace_id, project_id, decision_id)
        ]
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/decisions/{decision_id}/features/{feature_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def link_decision(
    workspace_id: str,
    project_id: str,
    decision_id: str,
    feature_id: str,
    db: Session = Depends(get_db),
) -> None:
    try:
        DecisionService(db).link(workspace_id, project_id, decision_id, feature_id)
    except (DuplicateName, EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc


@router.delete(
    "/workspaces/{workspace_id}/projects/{project_id}/decisions/{decision_id}/features/{feature_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unlink_decision(
    workspace_id: str,
    project_id: str,
    decision_id: str,
    feature_id: str,
    db: Session = Depends(get_db),
) -> None:
    try:
        DecisionService(db).unlink(workspace_id, project_id, decision_id, feature_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/decisions",
    response_model=list[DecisionResponse],
)
def feature_decisions(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> list[DecisionResponse]:
    try:
        return [
            DecisionResponse.model_validate(item)
            for item in DecisionService(db).feature_decisions(workspace_id, project_id, feature_id)
        ]
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/invariants",
    response_model=list[InvariantResponse],
)
def list_invariants(
    workspace_id: str,
    project_id: str,
    include_retired: bool = Query(default=True),
    db: Session = Depends(get_db),
) -> list[InvariantResponse]:
    try:
        return [
            InvariantResponse.model_validate(item)
            for item in InvariantService(db).list_invariants(
                workspace_id, project_id, include_retired
            )
        ]
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/invariants",
    response_model=InvariantResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invariant(
    workspace_id: str,
    project_id: str,
    payload: InvariantCreate,
    db: Session = Depends(get_db),
) -> InvariantResponse:
    try:
        invariant = InvariantService(db).create(
            workspace_id,
            project_id,
            payload.title,
            payload.statement,
            payload.rationale,
            payload.feature_id,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return InvariantResponse.model_validate(invariant)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/invariants/{invariant_id}",
    response_model=InvariantResponse,
)
def get_invariant(
    workspace_id: str, project_id: str, invariant_id: str, db: Session = Depends(get_db)
) -> InvariantResponse:
    try:
        return InvariantResponse.model_validate(
            InvariantService(db).get(workspace_id, project_id, invariant_id)
        )
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.patch(
    "/workspaces/{workspace_id}/projects/{project_id}/invariants/{invariant_id}",
    response_model=InvariantResponse,
)
def update_invariant(
    workspace_id: str,
    project_id: str,
    invariant_id: str,
    payload: InvariantUpdate,
    db: Session = Depends(get_db),
) -> InvariantResponse:
    try:
        invariant = InvariantService(db).update(
            workspace_id,
            project_id,
            invariant_id,
            payload.title,
            payload.statement,
            payload.rationale,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return InvariantResponse.model_validate(invariant)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/invariants/{invariant_id}/retire",
    response_model=InvariantResponse,
)
def retire_invariant(
    workspace_id: str, project_id: str, invariant_id: str, db: Session = Depends(get_db)
) -> InvariantResponse:
    try:
        invariant = InvariantService(db).retire(workspace_id, project_id, invariant_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return InvariantResponse.model_validate(invariant)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/invariants/{invariant_id}/revisions",
    response_model=list[InvariantRevisionResponse],
)
def invariant_revisions(
    workspace_id: str, project_id: str, invariant_id: str, db: Session = Depends(get_db)
) -> list[InvariantRevisionResponse]:
    try:
        return [
            InvariantRevisionResponse.model_validate(item)
            for item in InvariantService(db).revisions(workspace_id, project_id, invariant_id)
        ]
    except EntityNotFound as exc:
        raise _service_error(exc) from exc


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/invariants",
    response_model=list[ApplicableInvariantResponse],
)
def feature_invariants(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> list[ApplicableInvariantResponse]:
    try:
        items = InvariantService(db).applicable(workspace_id, project_id, feature_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [
        ApplicableInvariantResponse.model_validate(
            {
                **InvariantResponse.model_validate(invariant).model_dump(),
                "acknowledged_revision": acknowledgement.acknowledged_revision
                if acknowledgement
                else None,
                "acknowledged_at": acknowledgement.acknowledged_at if acknowledgement else None,
                "needs_acknowledgement": (
                    acknowledgement is None
                    or acknowledgement.acknowledged_revision != invariant.revision
                ),
            }
        )
        for invariant, acknowledgement in items
    ]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/invariants/{invariant_id}/acknowledge",
    response_model=InvariantAcknowledgementResponse,
)
def acknowledge_invariant(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    invariant_id: str,
    payload: InvariantAcknowledgementRequest,
    db: Session = Depends(get_db),
) -> InvariantAcknowledgementResponse:
    try:
        acknowledgement = InvariantService(db).acknowledge(
            workspace_id, project_id, feature_id, invariant_id, payload.expected_revision
        )
    except (DuplicateName, EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return InvariantAcknowledgementResponse.model_validate(acknowledgement)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/readiness/preview",
    response_model=ReadinessEvaluationResponse,
)
def preview_readiness(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> ReadinessEvaluationResponse:
    try:
        project = PlanningService(db).project(workspace_id, project_id)
        feature = PlanningService(db).get_feature(workspace_id, project_id, feature_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return _readiness_response(ReadinessEngine(db).evaluate(project, feature))


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/readiness/evaluations",
    response_model=list[ReadinessEvaluationResponse],
)
def list_readiness_evaluations(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> list[ReadinessEvaluationResponse]:
    try:
        project_service = PlanningService(db)
        project = project_service.project(workspace_id, project_id)
        feature = project_service.get_feature(workspace_id, project_id, feature_id)
        evaluations = list(
            db.scalars(
                select(ReadinessEvaluationModel)
                .where(ReadinessEvaluationModel.feature_id == feature.id)
                .order_by(ReadinessEvaluationModel.evaluated_at.desc())
            ).all()
        )
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [_stored_readiness_response(item, project, feature, db) for item in evaluations]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/readiness/evaluations",
    response_model=ReadinessEvaluationResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_readiness_evaluation(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> ReadinessEvaluationResponse:
    try:
        project_service = PlanningService(db)
        project = project_service.project(workspace_id, project_id)
        feature = project_service.get_feature(workspace_id, project_id, feature_id)
        if project.status == ProjectStatus.ARCHIVED.value:
            raise InvalidInput("Archived projects are read-only")
        evaluation = ReadinessEngine(db).evaluate(project, feature)
        stored = ReadinessEvaluationModel(
            feature_id=evaluation.feature_id,
            evaluated_at=evaluation.evaluated_at,
            rule_set_version=evaluation.rule_set_version,
            input_fingerprint=evaluation.input_fingerprint,
            outcome=evaluation.outcome.value,
            results_json=json.dumps(
                {
                    "outcome": evaluation.outcome.value,
                    "passed_checks": evaluation.passed_checks,
                    "failed_checks": evaluation.failed_checks,
                    "blockers": evaluation.blockers,
                    "results": evaluation.results,
                },
                sort_keys=True,
            ),
            input_snapshot_json=json.dumps(evaluation.input_snapshot, sort_keys=True),
        )
        db.add(stored)
        db.commit()
        db.refresh(stored)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return _stored_readiness_response(stored, project, feature, db)
