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
