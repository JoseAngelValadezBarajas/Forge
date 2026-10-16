from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
