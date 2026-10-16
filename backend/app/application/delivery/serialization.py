"""Canonical serialization, fingerprints and transport response mapping."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.persistence.models import (
    EvidenceRecordModel,
    ReleaseCandidateModel,
    ReleaseGateEvaluationModel,
    ReleaseManifestModel,
    VerificationEvaluationModel,
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _json(raw: str) -> Any:
    return json.loads(raw)


def evidence_response(item: EvidenceRecordModel) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "feature_id": item.feature_id,
        "acceptance_criterion_id": item.acceptance_criterion_id,
        "run_id": item.run_id,
        "handoff_revision_id": item.handoff_revision_id,
        "context_package_id": item.context_package_id,
        "git_observation_id": item.git_observation_id,
        "evidence_type": item.evidence_type,
        "title": item.title,
        "description": item.description,
        "source_kind": item.source_kind,
        "source_reference": item.source_reference,
        "provenance": item.provenance,
        "declared_outcome": item.declared_outcome,
        "status": item.status,
        "version": item.version,
        "recorded_at": item.recorded_at,
        "invalidated_at": item.invalidated_at,
    }


def verification_response(
    item: VerificationEvaluationModel, *, stale: bool = False
) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "feature_id": item.feature_id,
        "rule_id": item.rule_id,
        "rule_version": item.rule_version,
        "subject": _json(item.subject_json),
        "inputs": _json(item.input_json),
        "input_fingerprint": item.input_fingerprint,
        "result": item.result,
        "findings": _json(item.findings_json),
        "limitations": _json(item.limitations_json),
        "evidence_ids": _json(item.evidence_ids_json),
        "verifier_version": item.verifier_version,
        "evaluated_at": item.evaluated_at,
        "stale": stale,
    }


def candidate_response(item: ReleaseCandidateModel) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "candidate_key": item.candidate_key,
        "title": item.title,
        "intended_version": item.intended_version,
        "description": item.description,
        "status": item.status,
        "schema_version": item.schema_version,
        "revision": item.revision,
        "content_fingerprint": item.content_fingerprint,
        "selection": _json(item.selection_json),
        "snapshot": _json(item.snapshot_json) if item.snapshot_json else None,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "frozen_at": item.frozen_at,
    }


def gate_response(item: ReleaseGateEvaluationModel, *, stale: bool = False) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "candidate_id": item.candidate_id,
        "candidate_revision": item.candidate_revision,
        "ruleset_version": item.ruleset_version,
        "input_fingerprint": item.input_fingerprint,
        "result": "STALE" if stale else item.result,
        "stored_result": item.result,
        "checks": _json(item.findings_json),
        "limitations": _json(item.limitations_json),
        "manifest": _json(item.manifest_json),
        "manifest_fingerprint": item.manifest_fingerprint,
        "evaluated_at": item.evaluated_at,
        "stale": stale,
    }


def manifest_response(item: ReleaseManifestModel) -> dict[str, Any]:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "candidate_id": item.candidate_id,
        "gate_evaluation_id": item.gate_evaluation_id,
        "schema_version": item.schema_version,
        "fingerprint": item.fingerprint,
        "payload": _json(item.payload_json),
        "markdown": item.markdown,
        "created_at": item.created_at,
    }
