from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.entities import EpicStatus, FeaturePriority, FeatureStatus, TaskStatus

SchemaVersion = Literal["forge-project-import-v1"]
SCHEMA_VERSION: SchemaVersion = "forge-project-import-v1"
EPIC_REF_PATTERN = r"^epic:[a-z][a-z0-9_-]{0,63}$"
FEATURE_REF_PATTERN = r"^feature:[a-z][a-z0-9_-]{0,63}$"
TASK_REF_PATTERN = r"^task:[a-z][a-z0-9_-]{0,63}$"
CRITERION_REF_PATTERN = r"^criterion:[a-z][a-z0-9_-]{0,63}$"


class StrictTransferModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _non_blank(value: str, label: str) -> str:
    if not value.strip():
        raise ValueError(f"{label} is required")
    return value


class ProjectImportProject(StrictTransferModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        return _non_blank(value, "Name")


class ProjectImportEpic(StrictTransferModel):
    ref: str = Field(pattern=EPIC_REF_PATTERN)
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    status: EpicStatus = EpicStatus.PLANNING

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        return _non_blank(value, "Title")


class ProjectImportTask(StrictTransferModel):
    ref: str = Field(pattern=TASK_REF_PATTERN)
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    status: TaskStatus = TaskStatus.TODO
    position: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        return _non_blank(value, "Title")


class ProjectImportCriterion(StrictTransferModel):
    ref: str = Field(pattern=CRITERION_REF_PATTERN)
    description: str = Field(min_length=1, max_length=5000)
    satisfied: bool = False
    position: int | None = Field(default=None, ge=0)

    @field_validator("description")
    @classmethod
    def description_not_blank(cls, value: str) -> str:
        return _non_blank(value, "Description")


class ProjectImportFeature(StrictTransferModel):
    ref: str = Field(pattern=FEATURE_REF_PATTERN)
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    goal: str | None = Field(default=None, max_length=5000)
    priority: FeaturePriority = FeaturePriority.MEDIUM
    status: FeatureStatus = FeatureStatus.BACKLOG
    epic_ref: str | None = Field(default=None, pattern=EPIC_REF_PATTERN)
    tasks: list[ProjectImportTask] = Field(default_factory=list, max_length=2000)
    acceptance_criteria: list[ProjectImportCriterion] = Field(
        default_factory=list, max_length=2000
    )

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        return _non_blank(value, "Title")


class ProjectImportDependency(StrictTransferModel):
    blocking_feature_ref: str = Field(pattern=FEATURE_REF_PATTERN)
    blocked_feature_ref: str = Field(pattern=FEATURE_REF_PATTERN)


class ProjectImportDocument(StrictTransferModel):
    schema_version: SchemaVersion
    project: ProjectImportProject
    epics: list[ProjectImportEpic] = Field(default_factory=list, max_length=100)
    features: list[ProjectImportFeature] = Field(default_factory=list, max_length=500)
    dependencies: list[ProjectImportDependency] = Field(default_factory=list, max_length=5000)


class ProjectImportCommitRequest(StrictTransferModel):
    document: ProjectImportDocument
    expected_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")


class ProjectImportCounts(StrictTransferModel):
    epics: int
    features: int
    tasks: int
    acceptance_criteria: int
    dependencies: int


class ProjectImportPreviewResponse(StrictTransferModel):
    schema_version: SchemaVersion
    workspace_id: str
    fingerprint: str
    project_name_conflict: bool
    document: ProjectImportDocument
    counts: ProjectImportCounts


class GeneratedReference(StrictTransferModel):
    ref: str
    generated_id: str
    parent_ref: str | None = None


class ProjectImportResponse(StrictTransferModel):
    schema_version: SchemaVersion
    workspace_id: str
    fingerprint: str
    project_id: str
    references: list[GeneratedReference]
    counts: ProjectImportCounts
