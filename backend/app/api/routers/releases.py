import json
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.api.errors import _delivery_error
from app.api.schemas import (
    CandidateCreate,
    CandidateFreezeRequest,
    CandidateHistoryResponse,
    CandidateResponse,
    CandidateUpdate,
    GateEvaluationResponse,
    ManifestResponse,
    ManifestSaveRequest,
)
from app.application.delivery import (
    DeliveryService,
    candidate_response,
    gate_response,
    manifest_response,
)
from app.application.services import EntityNotFound, InvalidInput, RevisionConflict
from app.db import get_db

router = APIRouter()


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates",
    response_model=list[CandidateResponse],
)
def list_release_candidates(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> list[CandidateResponse]:
    try:
        items = DeliveryService(db).candidate_list(workspace_id, project_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return [CandidateResponse.model_validate(candidate_response(item)) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates",
    response_model=CandidateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_release_candidate(
    workspace_id: str, project_id: str, payload: CandidateCreate, db: Session = Depends(get_db)
) -> CandidateResponse:
    try:
        item = DeliveryService(db).candidate_create(workspace_id, project_id, payload.model_dump())
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _delivery_error(exc) from exc
    return CandidateResponse.model_validate(candidate_response(item))


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}",
    response_model=CandidateResponse,
)
def get_release_candidate(
    workspace_id: str, project_id: str, candidate_id: str, db: Session = Depends(get_db)
) -> CandidateResponse:
    try:
        item = DeliveryService(db).candidate_get(workspace_id, project_id, candidate_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return CandidateResponse.model_validate(candidate_response(item))


@router.patch(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}",
    response_model=CandidateResponse,
)
def update_release_candidate(
    workspace_id: str,
    project_id: str,
    candidate_id: str,
    payload: CandidateUpdate,
    db: Session = Depends(get_db),
) -> CandidateResponse:
    try:
        item = DeliveryService(db).candidate_update(
            workspace_id, project_id, candidate_id, payload.model_dump()
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _delivery_error(exc) from exc
    return CandidateResponse.model_validate(candidate_response(item))


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}/freeze",
    response_model=CandidateResponse,
)
def freeze_release_candidate(
    workspace_id: str,
    project_id: str,
    candidate_id: str,
    payload: CandidateFreezeRequest,
    db: Session = Depends(get_db),
) -> CandidateResponse:
    try:
        item = DeliveryService(db).candidate_freeze(
            workspace_id, project_id, candidate_id, payload.expected_revision
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _delivery_error(exc) from exc
    return CandidateResponse.model_validate(candidate_response(item))


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}/revisions",
    response_model=list[CandidateHistoryResponse],
)
def list_candidate_revisions(
    workspace_id: str, project_id: str, candidate_id: str, db: Session = Depends(get_db)
) -> list[CandidateHistoryResponse]:
    try:
        items = DeliveryService(db).candidate_history(workspace_id, project_id, candidate_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return [
        CandidateHistoryResponse(
            id=item.id,
            candidate_id=item.candidate_id,
            revision=item.revision,
            status=item.status,
            content_fingerprint=item.content_fingerprint,
            snapshot=json.loads(item.snapshot_json),
            created_at=item.created_at,
        )
        for item in items
    ]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}/gates/preview",
    response_model=GateEvaluationResponse,
)
def preview_release_gates(
    workspace_id: str, project_id: str, candidate_id: str, db: Session = Depends(get_db)
) -> GateEvaluationResponse:
    try:
        result = DeliveryService(db).candidate_gate_preview(workspace_id, project_id, candidate_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    result.update(
        {
            "candidate_id": candidate_id,
            "project_id": project_id,
            "ruleset_version": "forge-release-gates-v1",
        }
    )
    return GateEvaluationResponse.model_validate(result)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}/gates/evaluate",
    response_model=GateEvaluationResponse,
    status_code=status.HTTP_201_CREATED,
)
def evaluate_release_gates(
    workspace_id: str, project_id: str, candidate_id: str, db: Session = Depends(get_db)
) -> GateEvaluationResponse:
    try:
        item = DeliveryService(db).candidate_gate_evaluate(workspace_id, project_id, candidate_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return GateEvaluationResponse.model_validate(gate_response(item))


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}/gates",
    response_model=list[GateEvaluationResponse],
)
def list_release_gate_evaluations(
    workspace_id: str, project_id: str, candidate_id: str, db: Session = Depends(get_db)
) -> list[GateEvaluationResponse]:
    service = DeliveryService(db)
    try:
        candidate = service.candidate_get(workspace_id, project_id, candidate_id)
        current = (
            service.candidate_gate_preview(workspace_id, project_id, candidate_id)
            if candidate.status == "FROZEN"
            else None
        )
        items = service.candidate_gate_history(workspace_id, project_id, candidate_id)
        return [
            GateEvaluationResponse.model_validate(
                gate_response(
                    item,
                    stale=bool(current and current["input_fingerprint"] != item.input_fingerprint),
                )
            )
            for item in items
        ]
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}/manifest",
    response_model=ManifestResponse,
)
def get_release_manifest(
    workspace_id: str,
    project_id: str,
    candidate_id: str,
    manifest_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ManifestResponse:
    try:
        item = DeliveryService(db).manifest_get(workspace_id, project_id, candidate_id, manifest_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return ManifestResponse.model_validate(manifest_response(item))


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}/manifest",
    response_model=ManifestResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_release_manifest(
    workspace_id: str,
    project_id: str,
    candidate_id: str,
    payload: ManifestSaveRequest,
    db: Session = Depends(get_db),
) -> ManifestResponse:
    try:
        item = DeliveryService(db).manifest_save(
            workspace_id, project_id, candidate_id, payload.gate_evaluation_id
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return ManifestResponse.model_validate(manifest_response(item))


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/release-candidates/{candidate_id}/manifest/download"
)
def download_release_manifest(
    workspace_id: str,
    project_id: str,
    candidate_id: str,
    format: Literal["json", "markdown"] = Query(default="json"),
    manifest_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Response:
    try:
        item = DeliveryService(db).manifest_get(workspace_id, project_id, candidate_id, manifest_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    if format == "markdown":
        return PlainTextResponse(
            item.markdown,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="forge-manifest-{item.id}.md"'},
        )
    return Response(
        content=item.payload_json,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="forge-manifest-{item.id}.json"'},
    )
