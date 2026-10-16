"""G01-G06 release-gate previews, saved evaluations and historical status."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.application.common.errors import EntityNotFound, InvalidInput
from app.persistence.models import (
    ProjectModel,
    ReleaseCandidateModel,
    ReleaseGateEvaluationModel,
    VerificationEvaluationModel,
)

from .base import DeliveryContext, DeliveryServiceBase, utc_now
from .candidates import CandidateService
from .constants import MANIFEST_SCHEMA, RELEASE_RULESET, VERIFIER_VERSION
from .manifests import manifest_completeness_errors
from .serialization import _json, canonical_json, digest
from .verification import VerificationService


class GateService(DeliveryServiceBase):
    def __init__(
        self,
        context: DeliveryContext,
        candidates: CandidateService,
        verifications: VerificationService,
    ) -> None:
        super().__init__(context)
        self.candidates = candidates
        self.verifications = verifications

    def _g04_result(self, item: ReleaseCandidateModel, snapshot: dict[str, Any]) -> dict[str, Any]:
        selected = snapshot["scope"]
        selected_contexts = set(selected["context_package_ids"])
        selected_evidence = set(selected["evidence_ids"])
        selected_handoffs = set(selected["handoff_revision_ids"])
        selected_features = set(selected["feature_ids"])
        artifact_evidence_ids = {
            row["id"]
            for row in snapshot["evidence_records"]
            if row["evidence_type"] == "artifact_reference" or row["source_kind"] == "artifact"
        }
        context_features = {row["id"]: row["feature_id"] for row in snapshot["context_packages"]}
        handoff_features = {row["id"]: row["feature_id"] for row in snapshot["handoff_revisions"]}
        required = {
            *(("V02", package_id) for package_id in selected_contexts),
            *(("V04", evidence_id) for evidence_id in selected_evidence),
            *(("V03", revision_id) for revision_id in selected_handoffs),
            *(("V01", evidence_id) for evidence_id in artifact_evidence_ids),
        }
        evaluations = snapshot["verification_evaluations"]
        evaluation_ids = [row["id"] for row in evaluations]
        persisted_rows = (
            list(
                self.session.scalars(
                    select(VerificationEvaluationModel).where(
                        VerificationEvaluationModel.id.in_(evaluation_ids)
                    )
                ).all()
            )
            if evaluation_ids
            else []
        )
        persisted_by_id = {row.id: row for row in persisted_rows}
        covered: set[tuple[str, str]] = set()
        blockers: list[str] = []
        stale_ids: set[str] = set()

        for evaluation in evaluations:
            evaluation_id = evaluation["id"]
            row = persisted_by_id.get(evaluation_id)
            if row is None or row.project_id != item.project_id:
                blockers.append(f"Verification {evaluation_id} is missing or outside this Project.")
                continue
            subject = evaluation.get("subject")
            if not isinstance(subject, dict):
                blockers.append(f"Verification {evaluation_id} has no valid frozen subject.")
                continue
            if (
                evaluation.get("project_id") != item.project_id
                or evaluation.get("feature_id") != row.feature_id
                or subject.get("project_id") != item.project_id
                or subject.get("feature_id") != row.feature_id
                or row.feature_id not in {None, *selected_features}
            ):
                blockers.append(
                    f"Verification {evaluation_id} is outside the frozen candidate scope."
                )
                continue
            persisted_shape = {
                "project_id": row.project_id,
                "feature_id": row.feature_id,
                "rule_id": row.rule_id,
                "rule_version": row.rule_version,
                "result": row.result,
                "input_fingerprint": row.input_fingerprint,
                "evidence_ids": _json(row.evidence_ids_json),
                "subject": _json(row.subject_json),
                "inputs": _json(row.input_json),
                "verifier_version": row.verifier_version,
            }
            frozen_shape = {key: evaluation.get(key) for key in persisted_shape}
            if canonical_json(frozen_shape) != canonical_json(persisted_shape):
                blockers.append(f"Verification {evaluation_id} differs from its frozen record.")
                continue
            if row.rule_version != "1.0" or row.verifier_version != VERIFIER_VERSION:
                blockers.append(
                    f"Verification {evaluation_id} uses an unsupported rule or verifier version."
                )
                continue

            inputs = evaluation.get("inputs")
            if not isinstance(inputs, dict):
                blockers.append(f"Verification {evaluation_id} has no valid frozen inputs.")
                continue
            if (
                inputs.get("rule_id") != row.rule_id
                or inputs.get("rule_version") != row.rule_version
            ):
                blockers.append(f"Verification {evaluation_id} rule metadata is inconsistent.")
                continue
            matched_requirements: set[tuple[str, str]] = set()
            if row.rule_id == "V02":
                package_id = inputs.get("context_package_id")
                if (
                    isinstance(package_id, str)
                    and package_id in selected_contexts
                    and subject.get("feature_id") == context_features.get(package_id)
                ):
                    matched_requirements.add(("V02", package_id))
            elif row.rule_id == "V03":
                revision_id = inputs.get("handoff_revision_id")
                if (
                    isinstance(revision_id, str)
                    and revision_id in selected_handoffs
                    and subject.get("feature_id") == handoff_features.get(revision_id)
                ):
                    matched_requirements.add(("V03", revision_id))
            elif row.rule_id == "V04":
                evidence_ids = inputs.get("evidence_ids")
                trace = inputs.get("records")
                evidence_id_values = evidence_ids if isinstance(evidence_ids, list) else []
                trace_values = trace if isinstance(trace, list) else []
                valid_evidence_ids = (
                    bool(evidence_id_values)
                    and all(isinstance(value, str) for value in evidence_id_values)
                    and len(evidence_id_values) == len(set(evidence_id_values))
                )
                valid_trace = isinstance(trace, list) and all(
                    isinstance(entry, dict) and isinstance(entry.get("id"), str)
                    for entry in trace_values
                )
                trace_ids = {entry["id"] for entry in trace_values} if valid_trace else set()
                if (
                    valid_evidence_ids
                    and valid_trace
                    and set(evidence_id_values).issubset(selected_evidence)
                    and trace_ids == set(evidence_id_values)
                ):
                    matched_requirements.update(
                        ("V04", evidence_id) for evidence_id in evidence_id_values
                    )
            else:
                blockers.append(
                    f"Verification {evaluation_id} uses unsupported rule {row.rule_id}."
                )
                continue

            if not matched_requirements:
                blockers.append(
                    f"Verification {evaluation_id} does not verify a selected candidate input."
                )
                continue

            try:
                project = self.session.get(ProjectModel, item.project_id)
                if project is None:
                    blockers.append("Candidate Project is unavailable for freshness validation.")
                    continue
                is_stale = self.verifications.verification_is_stale(
                    project.workspace_id, item.project_id, row
                )
            except (EntityNotFound, InvalidInput, KeyError, TypeError, ValueError):
                is_stale = True
            if is_stale:
                stale_ids.add(evaluation_id)
                blockers.append(
                    f"Verification {evaluation_id} is stale against its current inputs."
                )
                continue
            if row.result != "PASS":
                blockers.append(f"Verification {evaluation_id} result is {row.result}, not PASS.")
                continue
            covered.update(matched_requirements)

        missing = sorted(required - covered)
        for rule_id, input_id in missing:
            if rule_id == "V01":
                blockers.append(
                    "V01 is required for selected artifact evidence, but managed artifact bytes "
                    f"are unavailable for input {input_id}."
                )
            else:
                blockers.append(
                    f"Required {rule_id} verification is missing or not current for "
                    f"input {input_id}."
                )
        blockers = sorted(set(blockers))
        status = "STALE" if stale_ids else ("PASS" if not blockers else "BLOCKED")
        return {
            "status": status,
            "explanation": (
                "Every selected Context Package, Evidence Record, and Handoff revision has a "
                "current passing verification under the supported rule policy."
                if status == "PASS"
                else (
                    "Required scoped verification coverage is absent, unsupported, failed, "
                    "blocked, or stale."
                )
            ),
            "inputs": selected["verification_ids"],
            "blockers": blockers,
            "limitations": [
                "V02 checks Context Package integrity, V03 checks Handoff revision integrity, and "
                "V04 checks Evidence traceability only; none proves functional acceptance."
            ],
        }

    def _gate_result(self, item: ReleaseCandidateModel) -> dict[str, Any]:
        if item.status != "FROZEN" or not item.snapshot_json:
            raise InvalidInput("Freeze the candidate before evaluating release gates")
        snapshot = _json(item.snapshot_json)
        current = self.candidates._capture_candidate(item)
        current.pop("captured_at", None)
        historical = dict(snapshot)
        historical.pop("captured_at", None)
        frozen_dependency_fingerprint = digest(canonical_json(historical))
        current_dependency_fingerprint = digest(canonical_json(current))
        stale = current_dependency_fingerprint != frozen_dependency_fingerprint
        selected = snapshot["scope"]
        chosen_features = set(selected["feature_ids"])
        feature_ids = {row["id"] for row in snapshot["features"]}
        selected_contexts = snapshot["context_packages"]
        contexts_by_feature: dict[str, list[dict[str, Any]]] = {}
        for context in selected_contexts:
            contexts_by_feature.setdefault(context["feature_id"], []).append(context)
        criteria_value = snapshot.get("acceptance_criteria")
        criteria = criteria_value if isinstance(criteria_value, list) else []
        covered = {
            row["acceptance_criterion_id"]
            for row in snapshot["evidence_records"]
            if row["status"] == "ACTIVE" and row["acceptance_criterion_id"]
        }
        checks = [
            {
                "rule_id": "G01",
                "version": "1.0",
                "status": "PASS"
                if len(feature_ids) == len(chosen_features) and bool(feature_ids)
                else "BLOCKED",
                "explanation": "Selected Features are present in the frozen Project scope."
                if len(feature_ids) == len(chosen_features) and feature_ids
                else "Candidate has missing or invalid Feature scope.",
                "inputs": selected["feature_ids"],
                "blockers": []
                if len(feature_ids) == len(chosen_features) and feature_ids
                else ["Select at least one in-scope Feature."],
                "limitations": ["Scope integrity does not establish implementation completeness."],
            },
            {
                "rule_id": "G02",
                "version": "1.0",
                "status": "PASS"
                if all(feature_id in contexts_by_feature for feature_id in chosen_features)
                and all(row["payload_digest"] == row["fingerprint"] for row in selected_contexts)
                else "BLOCKED",
                "explanation": "Each selected Feature has a pinned Context Package with a "
                "matching canonical fingerprint."
                if all(feature_id in contexts_by_feature for feature_id in chosen_features)
                and all(row["payload_digest"] == row["fingerprint"] for row in selected_contexts)
                else "One or more selected Features lack an intact pinned Context Package.",
                "inputs": [row["id"] for row in snapshot["context_packages"]],
                "blockers": []
                if all(feature_id in contexts_by_feature for feature_id in chosen_features)
                and all(row["payload_digest"] == row["fingerprint"] for row in selected_contexts)
                else ["Pin a saved Context Package for every selected Feature."],
                "limitations": ["Context integrity does not prove the plan was implemented."],
            },
            {
                "rule_id": "G03",
                "version": "1.0",
                "status": "PASS"
                if isinstance(criteria_value, list)
                and all(row["id"] in covered for row in criteria)
                else "BLOCKED",
                "explanation": "Every frozen acceptance criterion has selected active linked "
                "evidence."
                if isinstance(criteria_value, list)
                and all(row["id"] in covered for row in criteria)
                else "Some frozen acceptance criteria lack linked active evidence.",
                "inputs": selected["evidence_ids"],
                "blockers": []
                if isinstance(criteria_value, list)
                and all(row["id"] in covered for row in criteria)
                else [
                    "Frozen Acceptance Criteria snapshot is unavailable or lacks linked active "
                    "evidence."
                ],
                "limitations": [
                    "Linked evidence is documentary coverage, not independently verified "
                    "functional behavior."
                ],
            },
            {
                "rule_id": "G04",
                "version": "1.0",
                **self._g04_result(item, snapshot),
            },
            {
                "rule_id": "G05",
                "version": "1.0",
                "status": "STALE" if stale else "PASS",
                "explanation": "Current selected inputs still match the frozen snapshot."
                if not stale
                else "One or more selected inputs changed after candidate freeze.",
                "inputs": [item.content_fingerprint, current_dependency_fingerprint],
                "blockers": ["Freeze a new candidate revision after reviewing changed inputs."]
                if stale
                else [],
                "limitations": ["Freshness compares the explicit recorded candidate inputs."],
            },
        ]
        pre_manifest_result = (
            "READY_BY_DEFINED_GATES"
            if all(check["status"] == "PASS" for check in checks)
            else (
                "STALE"
                if stale or any(check["status"] == "STALE" for check in checks)
                else "BLOCKED"
            )
        )
        manifest = {
            "schema": MANIFEST_SCHEMA,
            "project_id": item.project_id,
            "project": snapshot["project"],
            "candidate": {
                "id": item.id,
                "key": item.candidate_key,
                "project_id": item.project_id,
                "schema_version": snapshot["schema_version"],
                "status": "FROZEN",
                "revision": item.revision,
                "fingerprint": item.content_fingerprint,
            },
            "scope": snapshot["scope"],
            "features": snapshot["features"],
            "acceptance_criteria": snapshot.get("acceptance_criteria"),
            "context_packages": snapshot["context_packages"],
            "evidence_records": snapshot["evidence_records"],
            "verification_evaluations": snapshot["verification_evaluations"],
            "handoff_revisions": snapshot["handoff_revisions"],
            "ruleset_version": RELEASE_RULESET,
            "gate_evaluation": {
                "result": pre_manifest_result,
                "ruleset_version": RELEASE_RULESET,
                "checks": checks,
            },
            "provenance": {
                "evidence_declarations": "REPORTED unless explicitly observed from persisted "
                "Forge records",
                "verification": "VERIFIED only for each named deterministic rule and its "
                "listed inputs",
            },
            "limitations": [
                "Gate satisfaction is limited to this ruleset and these inputs.",
                "No claim of functional completeness, publication, deployment, or external CI "
                "verification is made.",
            ],
            "integrity": {
                "algorithm": "SHA-256",
                "canonicalization": "forge-canonical-json-v1",
                "candidate_snapshot_fingerprint": digest(canonical_json(snapshot)),
            },
            "publication_status": "NOT_PUBLISHED",
            "candidate_captured_at": snapshot["captured_at"],
        }
        completeness_errors = manifest_completeness_errors(manifest)
        completeness = not completeness_errors
        checks.append(
            {
                "rule_id": "G06",
                "version": "1.0",
                "status": "PASS" if completeness else "BLOCKED",
                "explanation": "Versioned manifest schema, identities, scope references, rules, "
                "integrity and provenance are complete."
                if completeness
                else "Manifest schema or referenced data is incomplete or inconsistent.",
                "inputs": [
                    MANIFEST_SCHEMA,
                    manifest["integrity"]["candidate_snapshot_fingerprint"],
                ],
                "blockers": completeness_errors,
                "limitations": ["Manifest completeness does not mean publication occurred."],
            }
        )
        result = (
            "READY_BY_DEFINED_GATES"
            if all(check["status"] == "PASS" for check in checks)
            else (
                "STALE"
                if stale or any(check["status"] == "STALE" for check in checks)
                else "BLOCKED"
            )
        )
        manifest["gate_evaluation"]["result"] = result
        manifest["gate_evaluation"]["checks"] = checks
        manifest_fingerprint = digest(canonical_json(manifest))
        fingerprint = digest(
            canonical_json(
                {
                    "candidate_id": item.id,
                    "candidate_revision": item.revision,
                    "ruleset": RELEASE_RULESET,
                    "snapshot_fingerprint": digest(canonical_json(snapshot)),
                    "checks": checks,
                }
            )
        )
        return {
            "result": result,
            "checks": checks,
            "limitations": manifest["limitations"],
            "input_fingerprint": fingerprint,
            "manifest": manifest,
            "manifest_fingerprint": manifest_fingerprint,
            "stale": stale,
        }

    def candidate_gate_preview(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> dict[str, Any]:
        self.project(workspace_id, project_id)
        return self._gate_result(
            self.candidates.candidate_get(workspace_id, project_id, candidate_id)
        )

    def candidate_gate_evaluate(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> ReleaseGateEvaluationModel:
        self.project(workspace_id, project_id, writable=True)
        item = self.candidates.candidate_get(workspace_id, project_id, candidate_id)
        result = self._gate_result(item)
        gate = ReleaseGateEvaluationModel(
            id=str(uuid4()),
            project_id=project_id,
            candidate_id=item.id,
            candidate_revision=item.revision,
            ruleset_version=RELEASE_RULESET,
            input_fingerprint=result["input_fingerprint"],
            result=result["result"],
            findings_json=canonical_json(result["checks"]),
            limitations_json=canonical_json(result["limitations"]),
            manifest_json=canonical_json(result["manifest"]),
            manifest_fingerprint=result["manifest_fingerprint"],
            evaluated_at=utc_now(),
        )
        self.session.add(gate)
        self.session.commit()
        self.session.refresh(gate)
        return gate

    def candidate_gate_history(
        self, workspace_id: str, project_id: str, candidate_id: str
    ) -> list[ReleaseGateEvaluationModel]:
        self.candidates.candidate_get(workspace_id, project_id, candidate_id)
        return list(
            self.session.scalars(
                select(ReleaseGateEvaluationModel)
                .where(
                    ReleaseGateEvaluationModel.project_id == project_id,
                    ReleaseGateEvaluationModel.candidate_id == candidate_id,
                )
                .order_by(
                    ReleaseGateEvaluationModel.evaluated_at.desc(), ReleaseGateEvaluationModel.id
                )
            ).all()
        )
