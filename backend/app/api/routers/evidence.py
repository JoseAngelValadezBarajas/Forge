from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.errors import _delivery_error
from app.api.schemas import EvidenceCreate, EvidenceResponse
from app.application.delivery import DeliveryService, evidence_response
from app.application.services import EntityNotFound, InvalidInput
from app.db import get_db

router = APIRouter()


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/evidence",
    response_model=list[EvidenceResponse],
)
def list_evidence(
    workspace_id: str,
    project_id: str,
    search: str | None = Query(default=None, max_length=200),
    provenance: Literal["REPORTED", "OBSERVED", "VERIFIED", "UNKNOWN"] | None = None,
    state: Literal["ACTIVE", "INVALIDATED", "SUPERSEDED"] | None = Query(
        default=None, alias="status"
    ),
    db: Session = Depends(get_db),
) -> list[EvidenceResponse]:
    try:
        items = DeliveryService(db).evidence_list(
            workspace_id, project_id, query=search, provenance=provenance, status=state
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return [EvidenceResponse.model_validate(evidence_response(item)) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/evidence",
    response_model=EvidenceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_evidence(
    workspace_id: str, project_id: str, payload: EvidenceCreate, db: Session = Depends(get_db)
) -> EvidenceResponse:
    try:
        item = DeliveryService(db).evidence_create(workspace_id, project_id, payload.model_dump())
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return EvidenceResponse.model_validate(evidence_response(item))


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/evidence/{evidence_id}",
    response_model=EvidenceResponse,
)
def get_evidence(
    workspace_id: str, project_id: str, evidence_id: str, db: Session = Depends(get_db)
) -> EvidenceResponse:
    try:
        item = DeliveryService(db).evidence_get(workspace_id, project_id, evidence_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return EvidenceResponse.model_validate(evidence_response(item))


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/evidence/{evidence_id}/invalidate",
    response_model=EvidenceResponse,
)
def invalidate_evidence(
    workspace_id: str, project_id: str, evidence_id: str, db: Session = Depends(get_db)
) -> EvidenceResponse:
    try:
        item = DeliveryService(db).evidence_invalidate(workspace_id, project_id, evidence_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return EvidenceResponse.model_validate(evidence_response(item))
