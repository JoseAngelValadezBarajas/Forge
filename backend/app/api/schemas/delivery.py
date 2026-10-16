from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class EvidenceCreate(BaseModel):
    feature_id: str | None = None
    acceptance_criterion_id: str | None = None
    run_id: str | None = None
    evidence_type: Literal[
        "reported_test_result",
        "document_reference",
        "artifact_reference",
        "git_observation_reference",
        "context_snapshot_reference",
        "handoff_revision_reference",
        "manual_attestation",
    ]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    source_kind: Literal[
        "safe_link",
        "artifact",
        "commit",
        "context_package",
        "git_observation",
        "handoff_revision",
        "manual",
    ]
    source_reference: str | None = Field(default=None, max_length=1000)
    declared_outcome: str | None = Field(default=None, max_length=5000)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Title is required")
        return value


class EvidenceResponse(BaseModel):
    id: str
    project_id: str
    feature_id: str | None
    acceptance_criterion_id: str | None
    run_id: str | None
    handoff_revision_id: str | None
    context_package_id: str | None
    git_observation_id: str | None
    evidence_type: str
    title: str
    description: str
    source_kind: str
    source_reference: str | None
    provenance: Literal["REPORTED", "OBSERVED", "VERIFIED", "UNKNOWN"]
    declared_outcome: str | None
    status: Literal["ACTIVE", "INVALIDATED", "SUPERSEDED"]
    version: int
    recorded_at: datetime
    invalidated_at: datetime | None


class VerificationRequest(BaseModel):
    rule_id: Literal["V01", "V02", "V03", "V04"]
    feature_id: str | None = None
    context_package_id: str | None = None
    expected_digest: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{64}$")
    handoff_revision_id: str | None = None
    evidence_ids: list[str] = Field(default_factory=list, max_length=100)


class VerificationResponse(BaseModel):
    id: str | None = None
    project_id: str | None = None
    feature_id: str | None = None
    rule_id: str
    rule_version: str
    subject: dict[str, Any]
    inputs: dict[str, Any]
    input_fingerprint: str
    result: Literal["PASS", "FAIL", "BLOCKED", "NOT_EVALUATED", "ERROR"]
    findings: list[str]
    limitations: list[str]
    evidence_ids: list[str]
    verifier_version: str
    evaluated_at: datetime | None = None
    stale: bool = False


class CandidateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    intended_version: str | None = Field(default=None, max_length=80)
    description: str = Field(default="", max_length=10000)
    feature_ids: list[str] = Field(min_length=1, max_length=100)
    context_package_ids: list[str] = Field(default_factory=list, max_length=200)
    evidence_ids: list[str] = Field(default_factory=list, max_length=500)
    verification_ids: list[str] = Field(default_factory=list, max_length=500)
    handoff_revision_ids: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("title")
    @classmethod
    def candidate_title_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Candidate title is required")
        return value


class CandidateUpdate(CandidateCreate):
    expected_revision: int = Field(gt=0)


class CandidateFreezeRequest(BaseModel):
    expected_revision: int = Field(gt=0)


class CandidateResponse(BaseModel):
    id: str
    project_id: str
    candidate_key: str
    title: str
    intended_version: str | None
    description: str
    status: Literal["DRAFT", "FROZEN"]
    schema_version: str
    revision: int
    content_fingerprint: str
    selection: dict[str, Any]
    snapshot: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
    frozen_at: datetime | None


class GateCheckResponse(BaseModel):
    rule_id: str
    version: str
    status: Literal["PASS", "BLOCKED", "STALE"]
    explanation: str
    inputs: list[str]
    blockers: list[str]
    limitations: list[str]


class GateEvaluationResponse(BaseModel):
    id: str | None = None
    project_id: str | None = None
    candidate_id: str
    candidate_revision: int | None = None
    ruleset_version: str
    input_fingerprint: str
    result: Literal["READY_BY_DEFINED_GATES", "BLOCKED", "STALE"]
    stored_result: str | None = None
    checks: list[GateCheckResponse]
    limitations: list[str]
    manifest: dict[str, Any]
    manifest_fingerprint: str
    evaluated_at: datetime | None = None
    stale: bool = False


class CandidateHistoryResponse(BaseModel):
    id: str
    candidate_id: str
    revision: int
    status: str
    content_fingerprint: str
    snapshot: dict[str, Any]
    created_at: datetime


class ManifestSaveRequest(BaseModel):
    gate_evaluation_id: str = Field(min_length=1)


class ManifestResponse(BaseModel):
    id: str
    project_id: str
    candidate_id: str
    gate_evaluation_id: str
    schema_version: str
    fingerprint: str
    payload: dict[str, Any]
    markdown: str
    created_at: datetime
