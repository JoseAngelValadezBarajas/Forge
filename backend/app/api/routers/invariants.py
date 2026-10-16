from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.errors import _service_error
from app.api.schemas import (
    ApplicableInvariantResponse,
    InvariantAcknowledgementRequest,
    InvariantAcknowledgementResponse,
    InvariantCreate,
    InvariantResponse,
    InvariantRevisionResponse,
    InvariantUpdate,
)
from app.application.invariants import InvariantService
from app.application.services import DuplicateName, EntityNotFound, InvalidInput, RevisionConflict
from app.db import get_db

router = APIRouter()


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
