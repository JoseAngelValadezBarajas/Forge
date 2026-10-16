from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    published_revision: HandoffRevisionResponse | None
    acknowledgement: HandoffAcknowledgementResponse | None
    acknowledgements: list[HandoffAcknowledgementResponse]
