from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.entities import EpicStatus, FeaturePriority, FeatureStatus, TaskStatus


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
