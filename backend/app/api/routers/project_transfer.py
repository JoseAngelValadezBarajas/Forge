from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.errors import _service_error
from app.api.schemas import (
    GeneratedReference,
    ProjectImportCommitRequest,
    ProjectImportDocument,
    ProjectImportPreviewResponse,
    ProjectImportResponse,
)
from app.application.common.errors import (
    DuplicateName,
    EntityNotFound,
    InvalidInput,
    RevisionConflict,
)
from app.application.project_transfer import (
    ProjectTransferService,
    canonical_import_json,
)
from app.db import get_db

router = APIRouter()


def _transfer_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (DuplicateName, EntityNotFound, InvalidInput, RevisionConflict)):
        return _service_error(exc)
    return _service_error(InvalidInput(str(exc)))


@router.post(
    "/workspaces/{workspace_id}/projects/import/preview",
    response_model=ProjectImportPreviewResponse,
)
def preview_project_import(
    workspace_id: str,
    payload: ProjectImportDocument,
    db: Session = Depends(get_db),
) -> ProjectImportPreviewResponse:
    try:
        return ProjectTransferService(db).preview(workspace_id, payload)
    except (EntityNotFound, InvalidInput, ValueError) as exc:
        raise _transfer_error(exc) from exc


@router.post(
    "/workspaces/{workspace_id}/projects/import",
    response_model=ProjectImportResponse,
    status_code=status.HTTP_201_CREATED,
)
def import_project(
    workspace_id: str,
    payload: ProjectImportCommitRequest,
    db: Session = Depends(get_db),
) -> ProjectImportResponse:
    try:
        result = ProjectTransferService(db).import_project(
            workspace_id,
            payload.document,
            payload.expected_fingerprint,
        )
    except (DuplicateName, EntityNotFound, InvalidInput, RevisionConflict, ValueError) as exc:
        raise _transfer_error(exc) from exc
    return ProjectImportResponse(
        schema_version="forge-project-import-v1",
        workspace_id=workspace_id,
        fingerprint=result.fingerprint,
        project_id=result.project.id,
        references=[
            GeneratedReference(ref=ref, generated_id=generated_id, parent_ref=parent_ref)
            for ref, generated_id, parent_ref in result.references
        ],
        counts=result.counts,
    )


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/export",
)
def export_project(workspace_id: str, project_id: str, db: Session = Depends(get_db)) -> Response:
    try:
        document = ProjectTransferService(db).export_project(workspace_id, project_id)
    except (EntityNotFound, InvalidInput, ValueError) as exc:
        raise _transfer_error(exc) from exc
    return Response(
        content=canonical_import_json(document),
        media_type="application/json",
        headers={
            "Content-Disposition": (
                f'attachment; filename="forge-project-{project_id}-import-v1.json"'
            )
        },
    )
