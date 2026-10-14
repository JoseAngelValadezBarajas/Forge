from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.entities import (
    DecisionStatus,
    EpicStatus,
    FeaturePriority,
    FeatureStatus,
    InvariantStatus,
    TaskStatus,
)


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name is required")
        return value


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name is required")
        return value


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None
    status: Literal["active", "archived"]
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class EpicCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Title is required")
        return value


class EpicUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    status: EpicStatus | None = None


class EpicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    title: str
    description: str | None
    status: EpicStatus
    created_at: datetime
    updated_at: datetime


class FeatureCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    goal: str | None = Field(default=None, max_length=5000)
    priority: FeaturePriority = FeaturePriority.MEDIUM
    status: FeatureStatus = FeatureStatus.BACKLOG
    epic_id: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Title is required")
        return value


class FeatureUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    goal: str | None = Field(default=None, max_length=5000)
    priority: FeaturePriority | None = None
    status: FeatureStatus | None = None
    epic_id: str | None = None
    clear_epic: bool = False


class FeatureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    readable_id: str
    project_id: str
    epic_id: str | None
    title: str
    description: str | None
    goal: str | None
    priority: FeaturePriority
    status: FeatureStatus
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    status: TaskStatus = TaskStatus.TODO
    position: int | None = Field(default=None, ge=0)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    status: TaskStatus | None = None
    position: int | None = Field(default=None, ge=0)


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    feature_id: str
    title: str
    description: str | None
    status: TaskStatus
    position: int
    created_at: datetime
    updated_at: datetime


class AcceptanceCriterionCreate(BaseModel):
    description: str = Field(min_length=1, max_length=5000)
    satisfied: bool = False
    position: int | None = Field(default=None, ge=0)

    @field_validator("description")
    @classmethod
    def description_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Description is required")
        return value


class AcceptanceCriterionUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    satisfied: bool | None = None
    position: int | None = Field(default=None, ge=0)


class AcceptanceCriterionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    feature_id: str
    description: str
    satisfied: bool
    position: int
    created_at: datetime
    updated_at: datetime


class ReorderRequest(BaseModel):
    ids: list[str] = Field(min_length=0)


class DependencyCreate(BaseModel):
    blocking_feature_id: str
    blocked_feature_id: str


class DependencyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    blocking_feature_id: str
    blocked_feature_id: str
    created_at: datetime
    updated_at: datetime


class ProjectPlanningOverview(BaseModel):
    epics: int
    features: int
    tasks: int
    acceptance_criteria: int
    satisfied_criteria: int
    dependencies: int


class DecisionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    context: str = Field(min_length=1, max_length=10000)
    decision: str = Field(min_length=1, max_length=10000)
    rationale: str = Field(min_length=1, max_length=10000)
    alternatives_considered: str | None = Field(default=None, max_length=10000)
    tradeoffs: str | None = Field(default=None, max_length=10000)


class DecisionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    context: str | None = Field(default=None, min_length=1, max_length=10000)
    decision: str | None = Field(default=None, min_length=1, max_length=10000)
    rationale: str | None = Field(default=None, min_length=1, max_length=10000)
    alternatives_considered: str | None = Field(default=None, max_length=10000)
    tradeoffs: str | None = Field(default=None, max_length=10000)


class DecisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    title: str
    context: str
    decision: str
    rationale: str
    alternatives_considered: str | None
    tradeoffs: str | None
    status: DecisionStatus
    superseded_by_id: str | None
    revision: int
    created_at: datetime
    updated_at: datetime


class DecisionRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    decision_id: str
    revision: int
    title: str
    context: str
    decision: str
    rationale: str
    alternatives_considered: str | None
    tradeoffs: str | None
    status: DecisionStatus
    superseded_by_id: str | None
    created_at: datetime


class InvariantCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    statement: str = Field(min_length=1, max_length=10000)
    rationale: str = Field(min_length=1, max_length=10000)
    feature_id: str | None = None


class InvariantUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    statement: str | None = Field(default=None, min_length=1, max_length=10000)
    rationale: str | None = Field(default=None, min_length=1, max_length=10000)


class InvariantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    feature_id: str | None
    title: str
    statement: str
    rationale: str
    status: InvariantStatus
    revision: int
    created_at: datetime
    updated_at: datetime


class InvariantRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invariant_id: str
    revision: int
    title: str
    statement: str
    rationale: str
    status: InvariantStatus
    feature_id: str | None
    created_at: datetime


class InvariantAcknowledgementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    feature_id: str
    invariant_id: str
    acknowledged_revision: int
    acknowledged_at: datetime


class ApplicableInvariantResponse(InvariantResponse):
    acknowledged_revision: int | None
    acknowledged_at: datetime | None
    needs_acknowledgement: bool


class ReadinessReference(BaseModel):
    kind: str
    id: str
    label: str | None = None


class ReadinessBlocker(BaseModel):
    code: str
    message: str
    references: list[ReadinessReference] = Field(default_factory=list)


class ReadinessRuleResult(BaseModel):
    rule_id: str
    rule_version: str
    result: Literal["passed", "failed"]
    explanation: str
    blockers: list[ReadinessBlocker] = Field(default_factory=list)
    references: list[ReadinessReference] = Field(default_factory=list)


class ReadinessEvaluationResponse(BaseModel):
    evaluation_id: str | None
    feature_id: str
    evaluated_at: datetime
    rule_set_version: str
    input_fingerprint: str
    outcome: Literal["READY_TO_START", "NOT_READY"]
    passed_checks: list[str]
    failed_checks: list[str]
    blockers: list[ReadinessBlocker]
    results: list[ReadinessRuleResult]
    stale: bool = False
