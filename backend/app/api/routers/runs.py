import json
from typing import Literal, cast

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import _service_error
from app.api.schemas import (
    HandoffAcknowledgementResponse,
    HandoffAckRequest,
    HandoffCreate,
    HandoffResponse,
    HandoffRevisionResponse,
    HandoffUpdate,
    HandoffVersionRequest,
    RunCreate,
    RunEventCreate,
    RunEventResponse,
    RunOutputCreate,
    RunOutputResponse,
    RunResponse,
    RunStatusUpdate,
)
from app.application.runs import HandoffService, RunService
from app.application.services import EntityNotFound, InvalidInput, RevisionConflict
from app.db import get_db
from app.persistence.models import (
    AgentRunModel,
    HandoffAcknowledgementModel,
    HandoffModel,
    HandoffRevisionModel,
)

router = APIRouter()


def _run_response(item: AgentRunModel) -> RunResponse:
    return RunResponse.model_validate(item)


def _revision_response(item: HandoffRevisionModel) -> HandoffRevisionResponse:
    return HandoffRevisionResponse(
        id=item.id,
        handoff_id=item.handoff_id,
        revision=item.revision,
        title=item.title,
        summary=item.summary,
        outcomes=item.outcomes,
        blockers=item.blockers,
        questions=item.questions,
        next_actions=item.next_actions,
        references=item.references,
        schema_version=item.schema_version,
        context_package_id=item.context_package_id,
        context_fingerprint=item.context_fingerprint,
        fingerprint=item.fingerprint,
        payload=json.loads(item.payload_json),
        markdown=item.markdown,
        created_at=item.created_at,
    )


def _handoff_response(item: HandoffModel, db: Session) -> HandoffResponse:
    published = None
    if item.current_revision:
        revision = db.scalar(
            select(HandoffRevisionModel).where(
                HandoffRevisionModel.handoff_id == item.id,
                HandoffRevisionModel.revision == item.current_revision,
            )
        )
        if revision is not None:
            published = _revision_response(revision)
    acknowledgements = list(
        db.scalars(
            select(HandoffAcknowledgementModel)
            .where(HandoffAcknowledgementModel.handoff_id == item.id)
            .order_by(
                HandoffAcknowledgementModel.revision.asc(),
                HandoffAcknowledgementModel.acknowledged_at.asc(),
            )
        ).all()
    )
    current_acknowledgement = next(
        (
            acknowledgement
            for acknowledgement in acknowledgements
            if item.status == "ACKNOWLEDGED" and acknowledgement.revision == item.current_revision
        ),
        None,
    )
    return HandoffResponse(
        id=item.id,
        project_id=item.project_id,
        feature_id=item.feature_id,
        run_id=item.run_id,
        context_package_id=item.context_package_id,
        title=item.title,
        summary=item.summary,
        outcomes=item.outcomes,
        blockers=item.blockers,
        questions=item.questions,
        next_actions=item.next_actions,
        references=item.references,
        status=cast(Literal["DRAFT", "READY", "ACKNOWLEDGED", "WITHDRAWN"], item.status),
        current_revision=item.current_revision,
        version=item.version,
        created_at=item.created_at,
        updated_at=item.updated_at,
        ready_at=item.ready_at,
        acknowledged_at=item.acknowledged_at,
        withdrawn_at=item.withdrawn_at,
        published_revision=published,
        acknowledgement=(
            HandoffAcknowledgementResponse.model_validate(current_acknowledgement)
            if current_acknowledgement
            else None
        ),
        acknowledgements=[
            HandoffAcknowledgementResponse.model_validate(acknowledgement)
            for acknowledgement in acknowledgements
        ],
    )


@router.get("/workspaces/{workspace_id}/runs", response_model=list[RunResponse])
def list_workspace_runs(
    workspace_id: str,
    project_id: str | None = Query(default=None),
    feature_id: str | None = Query(default=None),
    run_status: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=160),
    db: Session = Depends(get_db),
) -> list[RunResponse]:
    try:
        items = RunService(db).list(workspace_id, project_id, feature_id, run_status, search)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return [_run_response(item) for item in items]


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/runs", response_model=list[RunResponse]
)
def list_project_runs(
    workspace_id: str,
    project_id: str,
    feature_id: str | None = Query(default=None),
    run_status: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=160),
    db: Session = Depends(get_db),
) -> list[RunResponse]:
    try:
        items = RunService(db).list(workspace_id, project_id, feature_id, run_status, search)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return [_run_response(item) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/runs",
    response_model=RunResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_run(
    workspace_id: str,
    project_id: str,
    payload: RunCreate,
    db: Session = Depends(get_db),
) -> RunResponse:
    try:
        item = RunService(db).create(
            workspace_id,
            project_id,
            payload.feature_id,
            payload.context_package_id,
            payload.title,
            payload.description,
            payload.execution_mode,
            payload.executor_type,
            payload.executor_label,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return _run_response(item)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/runs/{run_id}", response_model=RunResponse
)
def get_run(
    workspace_id: str, project_id: str, run_id: str, db: Session = Depends(get_db)
) -> RunResponse:
    try:
        item = RunService(db)._run(workspace_id, project_id, run_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return _run_response(item)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/runs/{run_id}/status",
    response_model=RunResponse,
)
def change_run_status(
    workspace_id: str,
    project_id: str,
    run_id: str,
    payload: RunStatusUpdate,
    db: Session = Depends(get_db),
) -> RunResponse:
    try:
        item = RunService(db).change_status(
            workspace_id, project_id, run_id, payload.status, payload.expected_version
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return _run_response(item)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/runs/{run_id}/events",
    response_model=list[RunEventResponse],
)
def list_run_events(
    workspace_id: str, project_id: str, run_id: str, db: Session = Depends(get_db)
) -> list[RunEventResponse]:
    try:
        items = RunService(db).events(workspace_id, project_id, run_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [RunEventResponse.model_validate(item) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/runs/{run_id}/events",
    response_model=RunEventResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_run_event(
    workspace_id: str,
    project_id: str,
    run_id: str,
    payload: RunEventCreate,
    db: Session = Depends(get_db),
) -> RunEventResponse:
    try:
        item = RunService(db).add_event(
            workspace_id,
            project_id,
            run_id,
            payload.event_type,
            payload.title,
            payload.description,
            payload.expected_version,
            payload.occurred_at,
            payload.supersedes_event_id,
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return RunEventResponse.model_validate(item)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/runs/{run_id}/outputs",
    response_model=list[RunOutputResponse],
)
def list_run_outputs(
    workspace_id: str, project_id: str, run_id: str, db: Session = Depends(get_db)
) -> list[RunOutputResponse]:
    try:
        items = RunService(db).outputs(workspace_id, project_id, run_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [RunOutputResponse.model_validate(item) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/runs/{run_id}/outputs",
    response_model=RunOutputResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_run_output(
    workspace_id: str,
    project_id: str,
    run_id: str,
    payload: RunOutputCreate,
    db: Session = Depends(get_db),
) -> RunOutputResponse:
    try:
        item = RunService(db).add_output(
            workspace_id,
            project_id,
            run_id,
            payload.label,
            payload.summary,
            payload.reference_kind,
            payload.reference_value,
            payload.provenance,
            payload.expected_version,
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return RunOutputResponse.model_validate(item)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/handoffs",
    response_model=list[HandoffResponse],
)
def list_handoffs(
    workspace_id: str,
    project_id: str,
    handoff_status: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=160),
    db: Session = Depends(get_db),
) -> list[HandoffResponse]:
    try:
        items = HandoffService(db).list(workspace_id, project_id, handoff_status, search)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return [_handoff_response(item, db) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/runs/{run_id}/handoffs",
    response_model=HandoffResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_handoff(
    workspace_id: str,
    project_id: str,
    run_id: str,
    payload: HandoffCreate,
    db: Session = Depends(get_db),
) -> HandoffResponse:
    try:
        item = HandoffService(db).create(
            workspace_id,
            project_id,
            run_id,
            payload.title,
            payload.summary,
            payload.outcomes,
            payload.blockers,
            payload.questions,
            payload.next_actions,
            payload.references,
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return _handoff_response(item, db)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/handoffs/{handoff_id}",
    response_model=HandoffResponse,
)
def get_handoff(
    workspace_id: str, project_id: str, handoff_id: str, db: Session = Depends(get_db)
) -> HandoffResponse:
    try:
        item = HandoffService(db)._handoff(workspace_id, project_id, handoff_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return _handoff_response(item, db)


@router.patch(
    "/workspaces/{workspace_id}/projects/{project_id}/handoffs/{handoff_id}",
    response_model=HandoffResponse,
)
def update_handoff(
    workspace_id: str,
    project_id: str,
    handoff_id: str,
    payload: HandoffUpdate,
    db: Session = Depends(get_db),
) -> HandoffResponse:
    values = payload.model_dump(exclude={"expected_version"}, exclude_unset=True)
    try:
        item = HandoffService(db).update_draft(
            workspace_id, project_id, handoff_id, payload.expected_version, values
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return _handoff_response(item, db)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/handoffs/{handoff_id}/ready",
    response_model=HandoffResponse,
)
def ready_handoff(
    workspace_id: str,
    project_id: str,
    handoff_id: str,
    payload: HandoffVersionRequest,
    db: Session = Depends(get_db),
) -> HandoffResponse:
    try:
        item = HandoffService(db).ready(
            workspace_id, project_id, handoff_id, payload.expected_version
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return _handoff_response(item, db)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/handoffs/{handoff_id}/revise",
    response_model=HandoffResponse,
)
def revise_handoff(
    workspace_id: str,
    project_id: str,
    handoff_id: str,
    payload: HandoffVersionRequest,
    db: Session = Depends(get_db),
) -> HandoffResponse:
    try:
        item = HandoffService(db).revise(
            workspace_id, project_id, handoff_id, payload.expected_version
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return _handoff_response(item, db)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/handoffs/{handoff_id}/acknowledge",
    response_model=HandoffAcknowledgementResponse,
)
def acknowledge_handoff(
    workspace_id: str,
    project_id: str,
    handoff_id: str,
    payload: HandoffAckRequest,
    db: Session = Depends(get_db),
) -> HandoffAcknowledgementResponse:
    try:
        item = HandoffService(db).acknowledge(
            workspace_id,
            project_id,
            handoff_id,
            payload.expected_revision,
            payload.acknowledged_by,
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return HandoffAcknowledgementResponse.model_validate(item)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/handoffs/{handoff_id}/withdraw",
    response_model=HandoffResponse,
)
def withdraw_handoff(
    workspace_id: str,
    project_id: str,
    handoff_id: str,
    payload: HandoffVersionRequest,
    db: Session = Depends(get_db),
) -> HandoffResponse:
    try:
        item = HandoffService(db).withdraw(
            workspace_id, project_id, handoff_id, payload.expected_version
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return _handoff_response(item, db)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/handoffs/{handoff_id}/revisions",
    response_model=list[HandoffRevisionResponse],
)
def list_handoff_revisions(
    workspace_id: str, project_id: str, handoff_id: str, db: Session = Depends(get_db)
) -> list[HandoffRevisionResponse]:
    try:
        items = HandoffService(db).revisions(workspace_id, project_id, handoff_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [_revision_response(item) for item in items]


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/handoffs/{handoff_id}/revisions/{revision}/download"
)
def download_handoff_revision(
    workspace_id: str,
    project_id: str,
    handoff_id: str,
    revision: int,
    format: Literal["json", "markdown"] = Query(default="json"),
    db: Session = Depends(get_db),
) -> Response:
    try:
        item = HandoffService(db).get_revision(workspace_id, project_id, handoff_id, revision)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    if format == "markdown":
        return PlainTextResponse(
            item.markdown,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="forge-handoff-{item.id}.md"'},
        )
    return Response(
        content=item.payload_json,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="forge-handoff-{item.id}.json"'},
    )
