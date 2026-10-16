from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ReadinessReference(BaseModel):
    kind: str
    id: str
    label: str | None


class ReadinessBlocker(BaseModel):
    code: str
    message: str
    references: list[ReadinessReference]


class ReadinessRuleResult(BaseModel):
    rule_id: str
    rule_version: str
    result: Literal["passed", "failed"]
    explanation: str
    blockers: list[ReadinessBlocker]
    references: list[ReadinessReference]


class ReadinessEvaluationResponse(BaseModel):
    evaluation_id: str | None
    feature_id: str
    evaluated_at: datetime
    rule_set_version: str
    input_fingerprint: str
    outcome: Literal["READY_TO_START", "NOT_READY"]
    passed_checks: list[str]
    failed_checks: list[str]
    blockers: list[ReadinessBlocker]
    results: list[ReadinessRuleResult]
    stale: bool
