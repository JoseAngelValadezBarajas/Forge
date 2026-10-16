"""Translate application-service failures into stable HTTP responses."""

from fastapi import HTTPException

from app.application.services import DuplicateName, EntityNotFound, InvalidInput, RevisionConflict


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


def _delivery_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (EntityNotFound, InvalidInput, RevisionConflict)):
        return _service_error(exc)
    return HTTPException(status_code=500, detail="Internal server error")
