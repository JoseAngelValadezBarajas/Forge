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


class InvariantAcknowledgementRequest(BaseModel):
    expected_revision: int = Field(gt=0)


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


class RepositoryConnectionCreate(BaseModel):
    root_path: str = Field(min_length=1, max_length=2000)

    @field_validator("root_path")
    @classmethod
    def path_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Repository path is required")
        return value


class RepositoryConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    root_path: str
    status: Literal["connected", "disconnected"]
    connected_at: datetime
    disconnected_at: datetime | None
    last_observed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class GitObservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    repository_id: str
    observed_at: datetime
    head_sha: str | None
    branch: str | None
    detached: bool
    unborn: bool
    clean: bool | None
    tracked_modified_count: int
    staged_count: int
    untracked_count: int
    observer_version: str
    status: str
    error_code: str | None
    error_detail: str | None


class FeatureRepositoryLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    feature_id: str
    repository_id: str
    created_at: datetime


class FeatureRepositoryLinkCreate(BaseModel):
    repository_id: str = Field(min_length=1)


class ContextPackageResponse(BaseModel):
    id: str | None
    project_id: str
    feature_id: str
    schema_version: str
    fingerprint: str
    created_at: datetime | None
    payload: dict[str, object]
    markdown: str


class RunCreate(BaseModel):
    feature_id: str = Field(min_length=1)
    context_package_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    execution_mode: Literal["manual"] = "manual"
    executor_type: Literal["human", "external_agent", "unknown"] = "human"
    executor_label: str | None = Field(default=None, max_length=160)


class RunStatusUpdate(BaseModel):
    status: Literal[
        "PLANNED", "IN_PROGRESS", "AWAITING_HANDOFF", "COMPLETED", "FAILED", "CANCELLED"
    ]
    expected_version: int = Field(gt=0)


class RunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    feature_id: str
    context_package_id: str
    context_schema_version: str
    context_fingerprint: str
    title: str
    description: str | None
    execution_mode: str
    executor_type: str
    executor_label: str | None
    status: Literal[
        "PLANNED", "IN_PROGRESS", "AWAITING_HANDOFF", "COMPLETED", "FAILED", "CANCELLED"
    ]
    version: int
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class RunEventCreate(BaseModel):
    event_type: Literal["progress", "blocker", "decision_note", "output_reported", "general_note"]
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=10000)
    expected_version: int = Field(gt=0)
    occurred_at: datetime | None = None
    supersedes_event_id: str | None = None


class RunEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    run_id: str
    event_type: str
    title: str
    description: str
    origin: str
    recorded_at: datetime
    occurred_at: datetime | None
    supersedes_event_id: str | None


class RunOutputCreate(BaseModel):
    label: str = Field(min_length=1, max_length=160)
    summary: str = Field(min_length=1, max_length=10000)
    reference_kind: Literal["label", "safe_link", "commit", "artifact"] = "label"
    reference_value: str | None = Field(default=None, max_length=500)
    provenance: str = Field(min_length=1, max_length=5000)
    expected_version: int = Field(gt=0)


class RunOutputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    run_id: str
    label: str
    summary: str
    reference_kind: str
    reference_value: str | None
    provenance: str
    created_at: datetime


class HandoffCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=10000)
    outcomes: str | None = Field(default=None, max_length=10000)
    blockers: str | None = Field(default=None, max_length=10000)
    questions: str | None = Field(default=None, max_length=10000)
    next_actions: str | None = Field(default=None, max_length=10000)
    references: str | None = Field(default=None, max_length=10000)


class HandoffUpdate(BaseModel):
    expected_version: int = Field(gt=0)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=10000)
    outcomes: str | None = Field(default=None, max_length=10000)
    blockers: str | None = Field(default=None, max_length=10000)
    questions: str | None = Field(default=None, max_length=10000)
    next_actions: str | None = Field(default=None, max_length=10000)
    references: str | None = Field(default=None, max_length=10000)


class HandoffVersionRequest(BaseModel):
    expected_version: int = Field(gt=0)


class HandoffAckRequest(BaseModel):
    expected_revision: int = Field(gt=0)
    acknowledged_by: str | None = Field(default=None, max_length=120)


class HandoffAcknowledgementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    handoff_id: str
    revision: int
    acknowledged_by: str | None
    acknowledged_at: datetime


class HandoffRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    handoff_id: str
    revision: int
    title: str
    summary: str
    outcomes: str
    blockers: str
    questions: str
    next_actions: str
    references: str
    schema_version: str
    context_package_id: str
    context_fingerprint: str
    fingerprint: str
    payload: dict[str, object]
    markdown: str
    created_at: datetime


class HandoffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    feature_id: str
    run_id: str
    context_package_id: str
    title: str
    summary: str
    outcomes: str
    blockers: str
    questions: str
    next_actions: str
    references: str
    status: Literal["DRAFT", "READY", "ACKNOWLEDGED", "WITHDRAWN"]
    current_revision: int
    version: int
    created_at: datetime
    updated_at: datetime
    ready_at: datetime | None
    acknowledged_at: datetime | None
    withdrawn_at: datetime | None
    published_revision: HandoffRevisionResponse | None = None
    acknowledgement: HandoffAcknowledgementResponse | None = None
    acknowledgements: list[HandoffAcknowledgementResponse] = Field(default_factory=list)
