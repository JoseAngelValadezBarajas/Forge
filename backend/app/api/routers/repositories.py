import json
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.api.errors import _service_error
from app.api.schemas import (
    ContextPackageResponse,
    FeatureRepositoryLinkCreate,
    FeatureRepositoryLinkResponse,
    GitObservationResponse,
    RepositoryConnectionCreate,
    RepositoryConnectionResponse,
)
from app.application.git_context import ContextPackageService, RepositoryService
from app.application.services import EntityNotFound, InvalidInput, RevisionConflict
from app.db import get_db
from app.persistence.models import ContextPackageModel

router = APIRouter()


def _preview_package_response(
    snapshot: object, project_id: str, feature_id: str
) -> ContextPackageResponse:
    return ContextPackageResponse(
        id=None,
        project_id=project_id,
        feature_id=feature_id,
        schema_version=snapshot.schema_version,  # type: ignore[attr-defined]
        fingerprint=snapshot.fingerprint,  # type: ignore[attr-defined]
        created_at=None,
        payload=snapshot.payload,  # type: ignore[attr-defined]
        markdown=snapshot.markdown,  # type: ignore[attr-defined]
    )


def _stored_package_response(package: ContextPackageModel) -> ContextPackageResponse:
    return ContextPackageResponse(
        id=package.id,
        project_id=package.project_id,
        feature_id=package.feature_id,
        schema_version=package.schema_version,
        fingerprint=package.fingerprint,
        created_at=package.created_at,
        payload=json.loads(package.payload_json),
        markdown=package.markdown,
    )


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/repositories",
    response_model=list[RepositoryConnectionResponse],
)
def list_repositories(
    workspace_id: str, project_id: str, db: Session = Depends(get_db)
) -> list[RepositoryConnectionResponse]:
    try:
        items = RepositoryService(db).list_connections(workspace_id, project_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [RepositoryConnectionResponse.model_validate(item) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/repositories",
    response_model=RepositoryConnectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def connect_repository(
    workspace_id: str,
    project_id: str,
    payload: RepositoryConnectionCreate,
    db: Session = Depends(get_db),
) -> RepositoryConnectionResponse:
    try:
        item = RepositoryService(db).connect(workspace_id, project_id, payload.root_path)
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return RepositoryConnectionResponse.model_validate(item)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/repositories/{repository_id}/observe",
    response_model=GitObservationResponse,
)
def observe_repository(
    workspace_id: str, project_id: str, repository_id: str, db: Session = Depends(get_db)
) -> GitObservationResponse:
    try:
        _repository, observation = RepositoryService(db).observe(
            workspace_id, project_id, repository_id
        )
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return GitObservationResponse.model_validate(observation)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/repositories/{repository_id}/observations",
    response_model=list[GitObservationResponse],
)
def list_repository_observations(
    workspace_id: str, project_id: str, repository_id: str, db: Session = Depends(get_db)
) -> list[GitObservationResponse]:
    try:
        items = RepositoryService(db).observations(workspace_id, project_id, repository_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [GitObservationResponse.model_validate(item) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/repositories/{repository_id}/disconnect",
    response_model=RepositoryConnectionResponse,
)
def disconnect_repository(
    workspace_id: str, project_id: str, repository_id: str, db: Session = Depends(get_db)
) -> RepositoryConnectionResponse:
    try:
        item = RepositoryService(db).disconnect(workspace_id, project_id, repository_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return RepositoryConnectionResponse.model_validate(item)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/repositories",
    response_model=list[RepositoryConnectionResponse],
)
def list_feature_repositories(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> list[RepositoryConnectionResponse]:
    try:
        items = RepositoryService(db).feature_links(workspace_id, project_id, feature_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [RepositoryConnectionResponse.model_validate(item) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/repositories",
    response_model=FeatureRepositoryLinkResponse,
    status_code=status.HTTP_201_CREATED,
)
def link_feature_repository(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    payload: FeatureRepositoryLinkCreate,
    db: Session = Depends(get_db),
) -> FeatureRepositoryLinkResponse:
    try:
        item = RepositoryService(db).link_feature(
            workspace_id, project_id, feature_id, payload.repository_id
        )
    except (EntityNotFound, InvalidInput, RevisionConflict) as exc:
        raise _service_error(exc) from exc
    return FeatureRepositoryLinkResponse.model_validate(item)


@router.delete(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/repositories/{repository_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unlink_feature_repository(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    repository_id: str,
    db: Session = Depends(get_db),
) -> None:
    try:
        RepositoryService(db).unlink_feature(workspace_id, project_id, feature_id, repository_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/context/preview",
    response_model=ContextPackageResponse,
)
def preview_context_package(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> ContextPackageResponse:
    try:
        snapshot = ContextPackageService(db).preview(workspace_id, project_id, feature_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return _preview_package_response(snapshot, project_id, feature_id)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/context/packages",
    response_model=list[ContextPackageResponse],
)
def list_context_packages(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> list[ContextPackageResponse]:
    try:
        items = ContextPackageService(db).list(workspace_id, project_id, feature_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return [_stored_package_response(item) for item in items]


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/context/packages",
    response_model=ContextPackageResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_context_package(
    workspace_id: str, project_id: str, feature_id: str, db: Session = Depends(get_db)
) -> ContextPackageResponse:
    try:
        package = ContextPackageService(db).save(workspace_id, project_id, feature_id)
    except (EntityNotFound, InvalidInput) as exc:
        raise _service_error(exc) from exc
    return _stored_package_response(package)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/context/packages/{package_id}",
    response_model=ContextPackageResponse,
)
def get_context_package(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    package_id: str,
    db: Session = Depends(get_db),
) -> ContextPackageResponse:
    try:
        package = ContextPackageService(db).get(workspace_id, project_id, feature_id, package_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    return _stored_package_response(package)


@router.get(
    "/workspaces/{workspace_id}/projects/{project_id}/features/{feature_id}/context/packages/{package_id}/download",
)
def download_context_package(
    workspace_id: str,
    project_id: str,
    feature_id: str,
    package_id: str,
    format: Literal["json", "markdown"] = Query(default="json"),
    db: Session = Depends(get_db),
) -> Response:
    try:
        package = ContextPackageService(db).get(workspace_id, project_id, feature_id, package_id)
    except EntityNotFound as exc:
        raise _service_error(exc) from exc
    if format == "markdown":
        return PlainTextResponse(
            package.markdown,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f'attachment; filename="forge-context-{package.id}.md"'
            },
        )
    return Response(
        content=package.payload_json,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="forge-context-{package.id}.json"'},
    )
