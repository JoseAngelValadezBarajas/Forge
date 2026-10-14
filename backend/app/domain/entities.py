from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


@dataclass(frozen=True, slots=True)
class Workspace:
    id: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class Project:
    id: str
    workspace_id: str
    name: str
    description: str | None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
