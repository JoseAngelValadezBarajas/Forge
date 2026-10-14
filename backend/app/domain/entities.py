from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class EpicStatus(StrEnum):
    PLANNING = "planning"
    ARCHIVED = "archived"


class FeaturePriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FeatureStatus(StrEnum):
    BACKLOG = "backlog"
    REFINING = "refining"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    VERIFY = "verify"
    DONE = "done"


class TaskStatus(StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class DecisionStatus(StrEnum):
    PROPOSED = "proposed"
    ACCEPTED = "accepted"
    SUPERSEDED = "superseded"


class InvariantStatus(StrEnum):
    ACTIVE = "active"
    RETIRED = "retired"


class ReadinessOutcome(StrEnum):
    READY_TO_START = "READY_TO_START"
    NOT_READY = "NOT_READY"


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
