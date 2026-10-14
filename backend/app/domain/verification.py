"""Pure, deterministic verification helpers; no HTTP, database, filesystem or network I/O."""

from __future__ import annotations

import hashlib
import json
from typing import Any


class VerificationEngine:
    version = "forge-verifier-v1"

    @staticmethod
    def canonical_digest(payload: Any, *, ensure_ascii: bool = True) -> str:
        canonical = json.dumps(
            payload, ensure_ascii=ensure_ascii, sort_keys=True, separators=(",", ":")
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @classmethod
    def input_fingerprint(
        cls,
        *,
        ruleset: str,
        rule_id: str,
        rule_version: str,
        subject: dict[str, Any],
        inputs: dict[str, Any],
    ) -> str:
        return cls.canonical_digest(
            {
                "ruleset": ruleset,
                "rule_id": rule_id,
                "rule_version": rule_version,
                "subject": subject,
                "inputs": inputs,
            }
        )

    @classmethod
    def context_package_digest(cls, payload: Any) -> str:
        # forge-context-v1 uses ensure_ascii=True and compact sorted-key JSON.
        return cls.canonical_digest(payload, ensure_ascii=True)

    @classmethod
    def handoff_revision_digest(cls, payload: Any) -> str:
        # forge-handoff-v1 persists canonical JSON with ensure_ascii=False.
        return cls.canonical_digest(payload, ensure_ascii=False)

    @classmethod
    def context_integrity(
        cls, payload: Any, stored_digest: str, expected_digest: str
    ) -> tuple[str, bool]:
        actual = cls.context_package_digest(payload)
        return actual, actual == stored_digest == expected_digest

    @classmethod
    def handoff_integrity(
        cls, payload: dict[str, Any], stored_digest: str, expected_identity: dict[str, Any]
    ) -> tuple[str, bool, bool]:
        actual = cls.handoff_revision_digest(payload)
        identity_matches = all(
            payload.get(key) == value for key, value in expected_identity.items()
        )
        return actual, identity_matches, actual == stored_digest and identity_matches

    @staticmethod
    def evidence_traceability_is_valid(trace: list[dict[str, Any]]) -> bool:
        return all(
            row["status"] == "ACTIVE"
            and (row["criterion_id"] is None or row["criterion_feature_id"] == row["feature_id"])
            for row in trace
        )
