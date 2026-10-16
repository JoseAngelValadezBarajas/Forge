"""Compatibility facade for application services and shared primitives.

New application code should import from the canonical owning modules.
"""

from app.application.common.errors import (
    DuplicateName,
    EntityNotFound,
    InvalidInput,
    RevisionConflict,
    ServiceError,
)
from app.application.common.validation import (
    clean_description,
    clean_name,
    clean_text,
    clean_title,
    now,
)
from app.application.planning import PlanningService
from app.application.projects import ProjectService
from app.application.workspaces import WorkspaceService, ensure_local_workspace

__all__ = [
    "DuplicateName",
    "EntityNotFound",
    "InvalidInput",
    "PlanningService",
    "ProjectService",
    "RevisionConflict",
    "ServiceError",
    "WorkspaceService",
    "clean_description",
    "clean_name",
    "clean_text",
    "clean_title",
    "ensure_local_workspace",
    "now",
]
