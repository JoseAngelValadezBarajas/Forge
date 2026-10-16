"""Persisted verification previews, evaluations, history and freshness."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.application.common.errors import EntityNotFound, InvalidInput
from app.persistence.models import (
    AcceptanceCriterionModel,
    ContextPackageModel,
    EvidenceRecordModel,
    FeatureModel,
    HandoffModel,
    HandoffRevisionModel,
    VerificationEvaluationModel,
)

from .base import DeliveryServiceBase, utc_now
from .constants import VERIFICATION_RULESET, VERIFIER_VERSION
from .serialization import _json, canonical_json
from .validation import _unique


class VerificationService(DeliveryServiceBase):
    @staticmethod
    def rule_catalog() -> list[dict[str, Any]]:
        return [
            {
                "rule_id": "V01",
                "version": "1.0",
                "title": "Artifact integrity",
                "available": False,
                "required_inputs": ["managed artifact bytes", "expected SHA-256"],
                "limitation": "Forge does not yet import or store artifact bytes.",
            },
            {
                "rule_id": "V02",
                "version": "1.0",
                "title": "Context Package integrity",
                "available": True,
                "required_inputs": ["saved Context Package ID"],
                "limitation": "Checks snapshot integrity only; it does not verify implementation.",
            },
            {
                "rule_id": "V03",
                "version": "1.0",
                "title": "Handoff revision integrity",
                "available": True,
                "required_inputs": ["saved Handoff revision ID"],
                "limitation": (
                    "Checks immutable report provenance only; acknowledgement is not execution "
                    "evidence."
                ),
            },
            {
                "rule_id": "V04",
                "version": "1.0",
                "title": "Evidence traceability",
                "available": True,
                "required_inputs": ["Evidence record IDs"],
                "limitation": "Checks ownership and links, not functional behavior.",
            },
        ]

    def _verification_inputs(
        self, project_id: str, rule_id: str, values: dict[str, Any]
    ) -> tuple[str | None, dict[str, Any], list[str], str, list[str]]:
        if rule_id not in {"V01", "V02", "V03", "V04"}:
            raise InvalidInput("Unknown verification rule")
        feature_id = values.get("feature_id")
        requested_feature_id = feature_id
        if feature_id is not None:
            feature = self.session.scalar(
                select(FeatureModel).where(
                    FeatureModel.id == feature_id,
                    FeatureModel.project_id == project_id,
                )
            )
            if feature is None:
                raise InvalidInput("Feature must belong to this Project")
        inputs: dict[str, Any] = {"rule_id": rule_id, "rule_version": "1.0"}
        evidence_ids: list[str] = []
        findings: list[str]
        limitations: list[str]
        result: str
        if rule_id == "V01":
            inputs["managed_artifact"] = None
            result = "BLOCKED"
            findings = ["No managed artifact bytes are available for hashing."]
            limitations = [
                "Artifact import is outside this FND-06 implementation; declared references are "
                "not read or fetched."
            ]
        elif rule_id == "V02":
            package_id = values.get("context_package_id")
            package = self.session.get(ContextPackageModel, package_id) if package_id else None
            if package is None or package.project_id != project_id:
                raise InvalidInput("Saved Context Package must belong to this Project")
            feature_id = package.feature_id
            if requested_feature_id is not None and requested_feature_id != feature_id:
                raise InvalidInput("Feature must match the Context Package subject")
            if (
                feature_id is not None
                and self.session.scalar(
                    select(FeatureModel.id).where(
                        FeatureModel.id == feature_id,
                        FeatureModel.project_id == project_id,
                    )
                )
                is None
            ):
                raise InvalidInput("Context Package Feature must belong to this Project")
            payload = _json(package.payload_json)
            expected_digest = values.get("expected_digest") or package.fingerprint
            actual, matched = self.verifier.context_integrity(
                payload, package.fingerprint, expected_digest
            )
            inputs.update(
                {
                    "context_package_id": package.id,
                    "schema_version": package.schema_version,
                    "stored_fingerprint": package.fingerprint,
                    "payload_digest": actual,
                    "expected_digest": expected_digest,
                }
            )
            result = "PASS" if matched else "FAIL"
            findings = [
                "Canonical Context Package payload fingerprint matches."
                if matched
                else "Canonical Context Package payload fingerprint does not match the "
                "expected digest."
            ]
            limitations = [
                "Proves snapshot integrity only; planning readiness and implementation are not "
                "verified."
            ]
        elif rule_id == "V03":
            revision = self.session.get(HandoffRevisionModel, values.get("handoff_revision_id"))
            handoff = self.session.get(HandoffModel, revision.handoff_id) if revision else None
            if revision is None or handoff is None or handoff.project_id != project_id:
                raise InvalidInput("Saved Handoff revision must belong to this Project")
            feature_id = handoff.feature_id
            if requested_feature_id is not None and requested_feature_id != feature_id:
                raise InvalidInput("Feature must match the Handoff revision subject")
            if (
                feature_id is not None
                and self.session.scalar(
                    select(FeatureModel.id).where(
                        FeatureModel.id == feature_id,
                        FeatureModel.project_id == project_id,
                    )
                )
                is None
            ):
                raise InvalidInput("Handoff Feature must belong to this Project")
            payload = _json(revision.payload_json)
            actual, identities_match, matched = self.verifier.handoff_integrity(
                payload,
                revision.fingerprint,
                {
                    "schema": "forge-handoff-v1",
                    "handoff_id": handoff.id,
                    "revision": revision.revision,
                    "project_id": project_id,
                    "feature_id": handoff.feature_id,
                },
            )
            identities_match = identities_match and revision.schema_version == "forge-handoff-v1"
            matched = matched and identities_match
            inputs.update(
                {
                    "handoff_id": handoff.id,
                    "handoff_revision_id": revision.id,
                    "revision": revision.revision,
                    "schema_version": revision.schema_version,
                    "stored_fingerprint": revision.fingerprint,
                    "payload_digest": actual,
                    "identities_match": identities_match,
                }
            )
            result = "PASS" if matched else "FAIL"
            findings = [
                "Immutable handoff revision payload and identity match."
                if matched
                else "Handoff revision payload, fingerprint, or identity is inconsistent."
            ]
            limitations = [
                "A handoff is a report. Acknowledgement does not prove execution or code quality."
            ]
        else:
            evidence_ids = _unique(values.get("evidence_ids", []))
            if not evidence_ids:
                raise InvalidInput("Select at least one Evidence Record")
            records = list(
                self.session.scalars(
                    select(EvidenceRecordModel).where(
                        EvidenceRecordModel.project_id == project_id,
                        EvidenceRecordModel.id.in_(evidence_ids),
                    )
                ).all()
            )
            if len(records) != len(evidence_ids):
                raise InvalidInput("Every Evidence Record must belong to this Project")
            features = {row.feature_id for row in records if row.feature_id is not None}
            if len(features) == 1:
                feature_id = next(iter(features))
            else:
                feature_id = None
            if requested_feature_id is not None and requested_feature_id != feature_id:
                raise InvalidInput("Feature must match the selected Evidence subject")
            criteria = {
                row.id: row.feature_id
                for row in self.session.scalars(
                    select(AcceptanceCriterionModel).where(
                        AcceptanceCriterionModel.id.in_(
                            [
                                r.acceptance_criterion_id
                                for r in records
                                if r.acceptance_criterion_id
                            ]
                        )
                    )
                ).all()
            }
            trace = [
                {
                    "id": row.id,
                    "feature_id": row.feature_id,
                    "criterion_id": row.acceptance_criterion_id,
                    "criterion_feature_id": criteria.get(row.acceptance_criterion_id or ""),
                    "status": row.status,
                    "provenance": row.provenance,
                }
                for row in sorted(records, key=lambda item: item.id)
            ]
            consistent = self.verifier.evidence_traceability_is_valid(trace)
            active = all(row.status == "ACTIVE" for row in records)
            inputs.update({"evidence_ids": evidence_ids, "records": trace})
            result = "PASS" if consistent and active else "FAIL"
            findings = [
                (
                    "Selected records exist in this Project and their Feature/criterion links "
                    "are coherent."
                    if result == "PASS"
                    else "One or more selected records are invalidated or have inconsistent "
                    "criterion ownership."
                )
            ]
            limitations = [
                "Structural traceability does not verify the truth of declarations or functional "
                "acceptance."
            ]
        return (
            feature_id,
            inputs,
            evidence_ids,
            result,
            findings + ["LIMITATIONS: " + item for item in limitations],
        )

    def verification_preview(
        self, workspace_id: str, project_id: str, rule_id: str, values: dict[str, Any]
    ) -> dict[str, Any]:
        self.project(workspace_id, project_id)
        feature_id, inputs, evidence_ids, result, messages = self._verification_inputs(
            project_id, rule_id, values
        )
        limitations = [
            item.removeprefix("LIMITATIONS: ")
            for item in messages
            if item.startswith("LIMITATIONS: ")
        ]
        findings = [item for item in messages if not item.startswith("LIMITATIONS: ")]
        subject = {"project_id": project_id, "feature_id": feature_id}
        fingerprint = self.verifier.input_fingerprint(
            ruleset=VERIFICATION_RULESET,
            rule_id=rule_id,
            rule_version="1.0",
            subject=subject,
            inputs=inputs,
        )
        return {
            "id": None,
            "rule_id": rule_id,
            "rule_version": "1.0",
            "subject": subject,
            "inputs": inputs,
            "input_fingerprint": fingerprint,
            "result": result,
            "findings": findings,
            "limitations": limitations,
            "evidence_ids": evidence_ids,
            "verifier_version": VERIFIER_VERSION,
            "evaluated_at": None,
            "stale": False,
        }

    def verification_evaluate(
        self, workspace_id: str, project_id: str, rule_id: str, values: dict[str, Any]
    ) -> VerificationEvaluationModel:
        self.project(workspace_id, project_id, writable=True)
        result = self.verification_preview(workspace_id, project_id, rule_id, values)
        item = VerificationEvaluationModel(
            id=str(uuid4()),
            project_id=project_id,
            feature_id=result["subject"]["feature_id"],
            rule_id=rule_id,
            rule_version=result["rule_version"],
            subject_json=canonical_json(result["subject"]),
            input_json=canonical_json(result["inputs"]),
            input_fingerprint=result["input_fingerprint"],
            result=result["result"],
            findings_json=canonical_json(result["findings"]),
            limitations_json=canonical_json(result["limitations"]),
            evidence_ids_json=canonical_json(result["evidence_ids"]),
            verifier_version=VERIFIER_VERSION,
            evaluated_at=utc_now(),
        )
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return item

    def verification_list(
        self, workspace_id: str, project_id: str
    ) -> list[VerificationEvaluationModel]:
        self.project(workspace_id, project_id)
        return list(
            self.session.scalars(
                select(VerificationEvaluationModel)
                .where(VerificationEvaluationModel.project_id == project_id)
                .order_by(
                    VerificationEvaluationModel.evaluated_at.desc(), VerificationEvaluationModel.id
                )
            ).all()
        )

    def verification_get(
        self, workspace_id: str, project_id: str, evaluation_id: str
    ) -> VerificationEvaluationModel:
        self.project(workspace_id, project_id)
        item = self.session.scalar(
            select(VerificationEvaluationModel).where(
                VerificationEvaluationModel.id == evaluation_id,
                VerificationEvaluationModel.project_id == project_id,
            )
        )
        if item is None:
            raise EntityNotFound("Verification evaluation not found")
        return item

    def verification_is_stale(
        self, workspace_id: str, project_id: str, item: VerificationEvaluationModel
    ) -> bool:
        inputs = _json(item.input_json)
        values: dict[str, Any] = {"feature_id": item.feature_id}
        if item.rule_id == "V02":
            values.update(
                {
                    "context_package_id": inputs["context_package_id"],
                    "expected_digest": inputs["expected_digest"],
                }
            )
        elif item.rule_id == "V03":
            values["handoff_revision_id"] = inputs["handoff_revision_id"]
        elif item.rule_id == "V04":
            values["evidence_ids"] = inputs["evidence_ids"]
        current = self.verification_preview(workspace_id, project_id, item.rule_id, values)
        return bool(current["input_fingerprint"] != item.input_fingerprint)
