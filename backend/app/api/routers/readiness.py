import json

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import _service_error
from app.api.schemas import ReadinessEvaluationResponse
from app.application.readiness import ReadinessEngine
from app.application.services import EntityNotFound, InvalidInput, PlanningService
from app.db import get_db
from app.domain.entities import ProjectStatus, ReadinessOutcome
from app.persistence.models import ReadinessEvaluationModel

router = APIRouter()


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
