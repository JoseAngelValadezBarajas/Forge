"""Shared request-scoped persistence access for Delivery use cases."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.services import InvalidInput, ProjectService
from app.domain.verification import VerificationEngine
from app.persistence.models import FeatureModel, ProjectModel

from .validation import _unique


class DeliveryContext:
    """Owns the shared SQLAlchemy session and common project-scope checks."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.projects = ProjectService(session)
        self.verifier = VerificationEngine()

    def project(
        self, workspace_id: str, project_id: str, *, writable: bool = False
    ) -> ProjectModel:
        project = self.projects.get(workspace_id, project_id)
        if writable and project.status != "active":
            raise InvalidInput("Archived projects are read-only")
        return project

    def features(self, project_id: str, ids: list[str]) -> list[FeatureModel]:
        wanted = _unique(ids)
        if not wanted:
            raise InvalidInput("Select at least one Feature")
        items = list(
            self.session.scalars(
                select(FeatureModel).where(
                    FeatureModel.project_id == project_id, FeatureModel.id.in_(wanted)
                )
            ).all()
        )
        if len(items) != len(wanted):
            raise InvalidInput("Every selected Feature must belong to this Project")
        return sorted(items, key=lambda item: item.id)


class DeliveryServiceBase:
    """Expose common request state without owning transaction boundaries."""

    def __init__(self, context: DeliveryContext) -> None:
        self.context = context

    @property
    def session(self) -> Session:
        return self.context.session

    @property
    def verifier(self) -> VerificationEngine:
        return self.context.verifier

    def project(
        self, workspace_id: str, project_id: str, *, writable: bool = False
    ) -> ProjectModel:
        return self.context.project(workspace_id, project_id, writable=writable)

    def features(self, project_id: str, ids: list[str]) -> list[FeatureModel]:
        return self.context.features(project_id, ids)


def utc_now() -> datetime:
    """Return an aware UTC timestamp, matching Delivery's persisted timestamp contract."""
    return datetime.now(UTC)
