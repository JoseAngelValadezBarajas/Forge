from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
