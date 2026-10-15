from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class WorkspaceModel(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    projects: Mapped[list["ProjectModel"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )


Index(
    "uq_workspaces_name_ci",
    func.lower(WorkspaceModel.name),
    unique=True,
)


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    workspace: Mapped[WorkspaceModel] = relationship(back_populates="projects")
    epics: Mapped[list["EpicModel"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    features: Mapped[list["FeatureModel"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


Index(
    "uq_projects_workspace_name_ci",
    ProjectModel.workspace_id,
    func.lower(ProjectModel.name),
    unique=True,
)


class EpicModel(Base):
    __tablename__ = "epics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planning")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[ProjectModel] = relationship(back_populates="epics")
    features: Mapped[list["FeatureModel"]] = relationship(back_populates="epic")


Index("ix_epics_project_updated", EpicModel.project_id, EpicModel.updated_at)


class FeatureModel(Base):
    __tablename__ = "features"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    epic_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("epics.id", ondelete="SET NULL"), nullable=True
    )
    readable_id: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="backlog")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    project: Mapped[ProjectModel] = relationship(back_populates="features")
    epic: Mapped[EpicModel | None] = relationship(back_populates="features")
    tasks: Mapped[list["TaskModel"]] = relationship(
        back_populates="feature", cascade="all, delete-orphan", order_by="TaskModel.position"
    )
    acceptance_criteria: Mapped[list["AcceptanceCriterionModel"]] = relationship(
        back_populates="feature",
        cascade="all, delete-orphan",
        order_by="AcceptanceCriterionModel.position",
    )

    @property
    def key(self) -> str:
        return self.readable_id


Index(
    "uq_features_project_readable_id",
    FeatureModel.project_id,
    FeatureModel.readable_id,
    unique=True,
)
Index("ix_features_project_status", FeatureModel.project_id, FeatureModel.status)
Index("ix_features_project_epic", FeatureModel.project_id, FeatureModel.epic_id)


class TaskModel(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="todo")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    feature: Mapped[FeatureModel] = relationship(back_populates="tasks")


Index("ix_tasks_feature_position", TaskModel.feature_id, TaskModel.position)


class AcceptanceCriterionModel(Base):
    __tablename__ = "acceptance_criteria"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    satisfied: Mapped[bool] = mapped_column(nullable=False, default=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    feature: Mapped[FeatureModel] = relationship(back_populates="acceptance_criteria")


Index(
    "ix_acceptance_criteria_feature_position",
    AcceptanceCriterionModel.feature_id,
    AcceptanceCriterionModel.position,
)


class FeatureDependencyModel(Base):
    __tablename__ = "feature_dependencies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    blocking_feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    blocked_feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


Index(
    "uq_feature_dependencies_edge",
    FeatureDependencyModel.project_id,
    FeatureDependencyModel.blocking_feature_id,
    FeatureDependencyModel.blocked_feature_id,
    unique=True,
)
Index("ix_feature_dependencies_project", FeatureDependencyModel.project_id)


class DecisionModel(Base):
    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    context: Mapped[str] = mapped_column(Text, nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    alternatives_considered: Mapped[str | None] = mapped_column(Text, nullable=True)
    tradeoffs: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="proposed")
    superseded_by_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("decisions.id", ondelete="SET NULL"), nullable=True
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


Index("ix_decisions_project_updated", DecisionModel.project_id, DecisionModel.updated_at)
Index("ix_decisions_project_status", DecisionModel.project_id, DecisionModel.status)


class DecisionRevisionModel(Base):
    __tablename__ = "decision_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    decision_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("decisions.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    context: Mapped[str] = mapped_column(Text, nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    alternatives_considered: Mapped[str | None] = mapped_column(Text, nullable=True)
    tradeoffs: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    superseded_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "uq_decision_revisions_revision",
    DecisionRevisionModel.decision_id,
    DecisionRevisionModel.revision,
    unique=True,
)


class DecisionFeatureLinkModel(Base):
    __tablename__ = "decision_feature_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    decision_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("decisions.id", ondelete="CASCADE"), nullable=False
    )
    feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "uq_decision_feature_link",
    DecisionFeatureLinkModel.decision_id,
    DecisionFeatureLinkModel.feature_id,
    unique=True,
)
Index("ix_decision_feature_links_feature", DecisionFeatureLinkModel.feature_id)


class InvariantModel(Base):
    __tablename__ = "invariants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    feature_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


Index("ix_invariants_project_status", InvariantModel.project_id, InvariantModel.status)
Index("ix_invariants_feature_status", InvariantModel.feature_id, InvariantModel.status)


class InvariantRevisionModel(Base):
    __tablename__ = "invariant_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    invariant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("invariants.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    feature_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "uq_invariant_revisions_revision",
    InvariantRevisionModel.invariant_id,
    InvariantRevisionModel.revision,
    unique=True,
)


class InvariantAcknowledgementModel(Base):
    __tablename__ = "invariant_acknowledgements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    invariant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("invariants.id", ondelete="CASCADE"), nullable=False
    )
    acknowledged_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "uq_invariant_acknowledgement",
    InvariantAcknowledgementModel.feature_id,
    InvariantAcknowledgementModel.invariant_id,
    unique=True,
)
Index("ix_invariant_acknowledgements_invariant", InvariantAcknowledgementModel.invariant_id)


class ReadinessEvaluationModel(Base):
    __tablename__ = "readiness_evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    rule_set_version: Mapped[str] = mapped_column(String(40), nullable=False)
    input_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    outcome: Mapped[str] = mapped_column(String(30), nullable=False)
    results_json: Mapped[str] = mapped_column(Text, nullable=False)
    input_snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)


Index(
    "ix_readiness_evaluations_feature_date",
    ReadinessEvaluationModel.feature_id,
    ReadinessEvaluationModel.evaluated_at,
)


class RepositoryConnectionModel(Base):
    __tablename__ = "repository_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    root_path: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="connected")
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


Index(
    "uq_repository_connections_project_root",
    RepositoryConnectionModel.project_id,
    RepositoryConnectionModel.root_path,
    unique=True,
)
Index(
    "ix_repository_connections_project_status",
    RepositoryConnectionModel.project_id,
    RepositoryConnectionModel.status,
)


class GitObservationModel(Base):
    __tablename__ = "git_observations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    repository_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("repository_connections.id", ondelete="CASCADE"), nullable=False
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    head_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    detached: Mapped[bool] = mapped_column(nullable=False, default=False)
    unborn: Mapped[bool] = mapped_column(nullable=False, default=False)
    clean: Mapped[bool | None] = mapped_column(nullable=True)
    tracked_modified_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    staged_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    untracked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    observer_version: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error_detail: Mapped[str | None] = mapped_column(String(240), nullable=True)


Index(
    "ix_git_observations_repository_date",
    GitObservationModel.repository_id,
    GitObservationModel.observed_at,
)


class FeatureRepositoryLinkModel(Base):
    __tablename__ = "feature_repository_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    repository_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("repository_connections.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "uq_feature_repository_link",
    FeatureRepositoryLinkModel.feature_id,
    FeatureRepositoryLinkModel.repository_id,
    unique=True,
)
Index("ix_feature_repository_links_repository", FeatureRepositoryLinkModel.repository_id)


class ContextPackageModel(Base):
    __tablename__ = "context_packages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    schema_version: Mapped[str] = mapped_column(String(40), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    markdown: Mapped[str] = mapped_column(Text, nullable=False)


Index(
    "uq_context_packages_feature_schema_fingerprint",
    ContextPackageModel.feature_id,
    ContextPackageModel.schema_version,
    ContextPackageModel.fingerprint,
    unique=True,
)
Index(
    "ix_context_packages_project_feature_date",
    ContextPackageModel.project_id,
    ContextPackageModel.feature_id,
    ContextPackageModel.created_at,
)


class AgentRunModel(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    context_package_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("context_packages.id", ondelete="RESTRICT"), nullable=False
    )
    context_schema_version: Mapped[str] = mapped_column(String(40), nullable=False)
    context_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    executor_type: Mapped[str] = mapped_column(String(40), nullable=False, default="human")
    executor_label: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PLANNED")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


Index("ix_agent_runs_project_updated", AgentRunModel.project_id, AgentRunModel.updated_at)
Index("ix_agent_runs_feature_status", AgentRunModel.feature_id, AgentRunModel.status)
Index("ix_agent_runs_context_package", AgentRunModel.context_package_id)


class RunEventModel(Base):
    __tablename__ = "run_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    origin: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    supersedes_event_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("run_events.id", ondelete="SET NULL"), nullable=True
    )
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")


Index("ix_run_events_run_recorded", RunEventModel.run_id, RunEventModel.recorded_at)
Index("ix_run_events_supersedes", RunEventModel.supersedes_event_id)


class RunOutputReferenceModel(Base):
    __tablename__ = "run_output_references"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    reference_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    reference_value: Mapped[str | None] = mapped_column(String(500), nullable=True)
    provenance: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "ix_run_outputs_run_created",
    RunOutputReferenceModel.run_id,
    RunOutputReferenceModel.created_at,
)


class HandoffModel(Base):
    __tablename__ = "handoffs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    feature_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="CASCADE"), nullable=False
    )
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False
    )
    context_package_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("context_packages.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    outcomes: Mapped[str] = mapped_column(Text, nullable=False)
    blockers: Mapped[str] = mapped_column(Text, nullable=False)
    questions: Mapped[str] = mapped_column(Text, nullable=False)
    next_actions: Mapped[str] = mapped_column(Text, nullable=False)
    references: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    current_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


Index("ix_handoffs_project_updated", HandoffModel.project_id, HandoffModel.updated_at)
Index("ix_handoffs_run_status", HandoffModel.run_id, HandoffModel.status)


class HandoffRevisionModel(Base):
    __tablename__ = "handoff_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    handoff_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("handoffs.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    outcomes: Mapped[str] = mapped_column(Text, nullable=False)
    blockers: Mapped[str] = mapped_column(Text, nullable=False)
    questions: Mapped[str] = mapped_column(Text, nullable=False)
    next_actions: Mapped[str] = mapped_column(Text, nullable=False)
    references: Mapped[str] = mapped_column(Text, nullable=False)
    schema_version: Mapped[str] = mapped_column(String(40), nullable=False)
    context_package_id: Mapped[str] = mapped_column(String(36), nullable=False)
    context_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    markdown: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "uq_handoff_revisions_revision",
    HandoffRevisionModel.handoff_id,
    HandoffRevisionModel.revision,
    unique=True,
)


class HandoffAcknowledgementModel(Base):
    __tablename__ = "handoff_acknowledgements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    handoff_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("handoffs.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    acknowledged_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "uq_handoff_acknowledgements_revision",
    HandoffAcknowledgementModel.handoff_id,
    HandoffAcknowledgementModel.revision,
    unique=True,
)


class EvidenceRecordModel(Base):
    __tablename__ = "evidence_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    feature_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="RESTRICT"), nullable=True
    )
    acceptance_criterion_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("acceptance_criteria.id", ondelete="RESTRICT"), nullable=True
    )
    run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("agent_runs.id", ondelete="RESTRICT"), nullable=True
    )
    handoff_revision_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("handoff_revisions.id", ondelete="RESTRICT"), nullable=True
    )
    context_package_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("context_packages.id", ondelete="RESTRICT"), nullable=True
    )
    git_observation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("git_observations.id", ondelete="RESTRICT"), nullable=True
    )
    evidence_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    source_reference: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    provenance: Mapped[str] = mapped_column(String(20), nullable=False, default="REPORTED")
    declared_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


Index(
    "ix_evidence_project_recorded", EvidenceRecordModel.project_id, EvidenceRecordModel.recorded_at
)
Index("ix_evidence_feature_status", EvidenceRecordModel.feature_id, EvidenceRecordModel.status)
Index("ix_evidence_criterion", EvidenceRecordModel.acceptance_criterion_id)


class VerificationEvaluationModel(Base):
    __tablename__ = "verification_evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    feature_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("features.id", ondelete="RESTRICT"), nullable=True
    )
    rule_id: Mapped[str] = mapped_column(String(40), nullable=False)
    rule_version: Mapped[str] = mapped_column(String(40), nullable=False)
    subject_json: Mapped[str] = mapped_column(Text, nullable=False)
    input_json: Mapped[str] = mapped_column(Text, nullable=False)
    input_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[str] = mapped_column(String(24), nullable=False)
    findings_json: Mapped[str] = mapped_column(Text, nullable=False)
    limitations_json: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_ids_json: Mapped[str] = mapped_column(Text, nullable=False)
    verifier_version: Mapped[str] = mapped_column(String(40), nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "ix_verifications_project_date",
    VerificationEvaluationModel.project_id,
    VerificationEvaluationModel.evaluated_at,
)
Index(
    "ix_verifications_feature_rule",
    VerificationEvaluationModel.feature_id,
    VerificationEvaluationModel.rule_id,
)


class ReleaseCandidateModel(Base):
    __tablename__ = "release_candidates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    candidate_key: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    intended_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    schema_version: Mapped[str] = mapped_column(
        String(40), nullable=False, default="forge-release-candidate-v1"
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    selection_json: Mapped[str] = mapped_column(Text, nullable=False)
    snapshot_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    frozen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


Index(
    "uq_release_candidates_project_key",
    ReleaseCandidateModel.project_id,
    ReleaseCandidateModel.candidate_key,
    unique=True,
)
Index(
    "ix_release_candidates_project_date",
    ReleaseCandidateModel.project_id,
    ReleaseCandidateModel.created_at,
)


class ReleaseCandidateRevisionModel(Base):
    __tablename__ = "release_candidate_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    candidate_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("release_candidates.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    content_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "uq_release_candidate_revision",
    ReleaseCandidateRevisionModel.candidate_id,
    ReleaseCandidateRevisionModel.revision,
    unique=True,
)


class ReleaseGateEvaluationModel(Base):
    __tablename__ = "release_gate_evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("release_candidates.id", ondelete="CASCADE"), nullable=False
    )
    candidate_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    ruleset_version: Mapped[str] = mapped_column(String(40), nullable=False)
    input_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[str] = mapped_column(String(32), nullable=False)
    findings_json: Mapped[str] = mapped_column(Text, nullable=False)
    limitations_json: Mapped[str] = mapped_column(Text, nullable=False)
    manifest_json: Mapped[str] = mapped_column(Text, nullable=False)
    manifest_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "ix_release_gates_candidate_date",
    ReleaseGateEvaluationModel.candidate_id,
    ReleaseGateEvaluationModel.evaluated_at,
)


class ReleaseManifestModel(Base):
    __tablename__ = "release_manifests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("release_candidates.id", ondelete="CASCADE"), nullable=False
    )
    gate_evaluation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("release_gate_evaluations.id", ondelete="RESTRICT"), nullable=False
    )
    schema_version: Mapped[str] = mapped_column(String(40), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    markdown: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


Index(
    "uq_release_manifest_candidate_gate",
    ReleaseManifestModel.candidate_id,
    ReleaseManifestModel.gate_evaluation_id,
    unique=True,
)
