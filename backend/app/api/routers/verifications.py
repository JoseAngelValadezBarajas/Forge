from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.errors import _delivery_error
from app.api.schemas import VerificationRequest, VerificationResponse, VerificationRuleResponse
from app.application.delivery import DeliveryService, verification_response
from app.application.services import EntityNotFound, InvalidInput, RevisionConflict
from app.db import get_db

router = APIRouter()


@router.get("/workspaces/{workspace_id}/projects/{project_id}/verifications/rules")
def list_verification_rules(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> list[VerificationRuleResponse]:
    try:
        DeliveryService(db).project(workspace_id, project_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    return [
        VerificationRuleResponse.model_validate(item)
        for item in DeliveryService(db).rule_catalog()
    ]


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/verifications",
    response_model=list[VerificationResponse],
)
def list_verification_evaluations(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> list[VerificationResponse]:
    service = DeliveryService(db)
    try:
        items = service.verification_list(workspace_id, project_id)
        return [
            VerificationResponse.model_validate(
                verification_response(
                    item, stale=service.verification_is_stale(workspace_id, project_id, item)
                )
            )
            for item in items
        ]
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/verifications/preview",
    response_model=VerificationResponse,
)
def preview_verification(
    workspace_id: str, project_id: str, payload: VerificationRequest, db: Session = Depends(get_db)
) -> VerificationResponse:
    try:
        result = DeliveryService(db).verification_preview(
            workspace_id, project_id, payload.rule_id, payload.model_dump()
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
    result["project_id"] = project_id
    result["feature_id"] = result["subject"]["feature_id"]
    return VerificationResponse.model_validate(result)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/verifications/evaluate",
    response_model=VerificationResponse,
    status_code=status.HTTP_201_CREATED,
)
def evaluate_verification(
    workspace_id: str, project_id: str, payload: VerificationRequest, db: Session = Depends(get_db)
) -> VerificationResponse:
    try:
        item = DeliveryService(db).verification_evaluate(
            workspace_id, project_id, payload.rule_id, payload.model_dump()
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _delivery_error(exc) from exc
    return VerificationResponse.model_validate(verification_response(item))


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/verifications/{evaluation_id}",
    response_model=VerificationResponse,
)
def get_verification_evaluation(
    workspace_id: str, project_id: str, evaluation_id: str, db: Session = Depends(get_db)
) -> VerificationResponse:
    service = DeliveryService(db)
    try:
        item = service.verification_get(workspace_id, project_id, evaluation_id)
        return VerificationResponse.model_validate(
            verification_response(
                item, stale=service.verification_is_stale(workspace_id, project_id, item)
            )
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _delivery_error(exc) from exc
