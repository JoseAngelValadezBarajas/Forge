from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.entities import DecisionStatus


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
