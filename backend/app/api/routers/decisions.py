from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.errors import _service_error
from app.api.schemas import (
    DecisionCreate,
    DecisionResponse,
    DecisionRevisionResponse,
    DecisionUpdate,
)
from app.application.decisions import DecisionService
from app.application.services import DuplicateName, EntityNotFound, InvalidInput
from app.db import get_db

router = APIRouter()


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
