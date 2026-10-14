"""Deterministic, metadata-only Context Package construction."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

SCHEMA_VERSION = "forge-context-v1"
_WHITESPACE = re.compile(r"[ \t]+")


@dataclass(frozen=True, slots=True)
class ContextPackageSnapshot:
    schema_version: str
    fingerprint: str
    payload: dict[str, Any]
    canonical_json: str
    markdown: str


def normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = unicodedata.normalize("NFKC", value).replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(_WHITESPACE.sub(" ", line).strip() for line in normalized.split("\n")).strip()


class ContextPackageBuilder:
    """Build the same canonical snapshot used for JSON, Markdown and hashing."""

    schema_version = SCHEMA_VERSION

    def build(
        self,
        *,
        project: dict[str, Any],
        feature: dict[str, Any],
        planning: dict[str, Any],
        dependencies: list[dict[str, Any]],
        decisions: list[dict[str, Any]],
        invariants: list[dict[str, Any]],
        readiness: dict[str, Any] | None,
        observations: list[dict[str, Any]] | None = None,
    ) -> ContextPackageSnapshot:
        payload: dict[str, Any] = {
            "schema": self.schema_version,
            "project": self._text_record(project, ("name", "description", "status")),
            "feature": self._text_record(
                feature, ("id", "key", "title", "description", "goal", "priority", "status")
            ),
            "planning": self._planning(planning),
            "dependencies": self._sorted_records(dependencies, "id"),
            "decisions": self._sorted_records(decisions, "id"),
            "invariants": self._sorted_records(invariants, "id"),
            "readiness": self._readiness(readiness),
            "git_observations": self._sorted_records(
                observations or [], "id", fallback=("observed_at", "head_sha")
            ),
        }
        canonical_json = json.dumps(
            payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True
        )
        fingerprint = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
        return ContextPackageSnapshot(
            schema_version=self.schema_version,
            fingerprint=fingerprint,
            payload=payload,
            canonical_json=canonical_json,
            markdown=self._markdown(payload, fingerprint),
        )

    def _text_record(self, source: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
        return {
            field: normalize_text(str(source[field])) if source.get(field) is not None else None
            for field in fields
        }

    def _planning(self, source: dict[str, Any]) -> dict[str, Any]:
        return {
            "tasks": [
                self._text_record(item, ("id", "title", "description", "status"))
                | {"position": item.get("position")}
                for item in self._sorted_records(
                    source.get("tasks", []), "id", fallback=("position",)
                )
            ],
            "acceptance_criteria": [
                self._text_record(item, ("id", "description"))
                | {
                    "satisfied": bool(item.get("satisfied", False)),
                    "position": item.get("position"),
                }
                for item in self._sorted_records(
                    source.get("acceptance_criteria", []), "id", fallback=("position",)
                )
            ],
        }

    def _readiness(self, source: dict[str, Any] | None) -> dict[str, Any] | None:
        if source is None:
            return None
        return {
            "evaluation_id": source.get("evaluation_id"),
            "evaluated_at": source.get("evaluated_at"),
            "rule_set_version": source.get("rule_set_version"),
            "input_fingerprint": source.get("input_fingerprint"),
            "outcome": source.get("outcome"),
            "stale": bool(source.get("stale", False)),
            "blockers": self._sorted_records(source.get("blockers", []), "code"),
        }

    @staticmethod
    def _sorted_records(
        records: list[dict[str, Any]],
        key: str,
        fallback: tuple[str, ...] = (),
    ) -> list[dict[str, Any]]:
        ordered = sorted(
            records,
            key=lambda item: tuple(str(item.get(field, "")) for field in (key, *fallback)),
        )
        return [ContextPackageBuilder._normalize_record(item) for item in ordered]

    @classmethod
    def _normalize_record(cls, record: dict[str, Any]) -> dict[str, Any]:
        return {key: cls._normalize_value(value) for key, value in record.items()}

    @classmethod
    def _normalize_value(cls, value: Any) -> Any:
        if isinstance(value, str):
            return normalize_text(value)
        if isinstance(value, list):
            return [cls._normalize_value(item) for item in value]
        if isinstance(value, dict):
            return {key: cls._normalize_value(item) for key, item in value.items()}
        return value

    @staticmethod
    def _markdown(payload: dict[str, Any], fingerprint: str) -> str:
        project = payload["project"]
        feature = payload["feature"]
        lines = [
            "# Forge Context Package",
            "",
            f"- Schema: `{payload['schema']}`",
            f"- Fingerprint: `{fingerprint}`",
            "",
            "## Project",
            "",
            (
                f"**{project.get('name') or 'Unnamed project'}** · "
                f"{project.get('status') or 'unknown'}"
            ),
            "",
            "## Feature",
            "",
            f"**{feature.get('key') or feature.get('id')} · {feature.get('title') or 'Untitled'}**",
            "",
            feature.get("goal") or "No goal recorded.",
            "",
            "## Planning",
            "",
            f"- Tasks: {len(payload['planning']['tasks'])}",
            f"- Acceptance criteria: {len(payload['planning']['acceptance_criteria'])}",
            f"- Dependencies: {len(payload['dependencies'])}",
            f"- Decisions: {len(payload['decisions'])}",
            f"- Invariants: {len(payload['invariants'])}",
            "",
            "## Readiness",
            "",
            str(
                payload["readiness"].get("outcome")
                if payload["readiness"]
                else "No saved evaluation."
            ),
            "",
            "## Git observations",
            "",
            (
                f"{len(payload['git_observations'])} metadata observation(s). "
                "Source content and machine-specific details are excluded."
            ),
            "",
        ]
        return "\n".join(lines)
