from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.entities import InvariantStatus


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
