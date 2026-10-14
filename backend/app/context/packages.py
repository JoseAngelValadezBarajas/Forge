"""Deterministic, metadata-only Context Package construction."""

from __future__ import annotations

import hashlib
import html
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
            "project": self._text_record(project, ("id", "name", "description", "status")),
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
            markdown=self._markdown(payload, fingerprint, canonical_json),
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
                for item in self._positioned_records(source.get("tasks", []))
            ],
            "acceptance_criteria": [
                self._text_record(item, ("id", "description"))
                | {
                    "satisfied": bool(item.get("satisfied", False)),
                    "position": item.get("position"),
                }
                for item in self._positioned_records(source.get("acceptance_criteria", []))
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

    @staticmethod
    def _positioned_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        def position_key(item: dict[str, Any]) -> tuple[bool, int, str]:
            position = item.get("position")
            try:
                numeric_position = int(position) if position is not None else 0
            except (TypeError, ValueError):
                numeric_position = 0
            return position is None, numeric_position, str(item.get("id", ""))

        ordered = sorted(records, key=position_key)
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
    def _markdown(
        payload: dict[str, Any], fingerprint: str, canonical_json: str
    ) -> str:
        lines: list[str] = [
            "# Forge Context Package",
            "",
            f"- Schema: `{payload['schema']}`",
            f"- Fingerprint: `{fingerprint}`",
            "",
            "## Project",
            "",
        ]

        def add_record(title: str, record: dict[str, Any]) -> None:
            lines.extend(
                [
                    f"### {html.escape(title)}",
                    "",
                    "<pre>",
                    html.escape(json.dumps(record, ensure_ascii=False, sort_keys=True, indent=2)),
                    "</pre>",
                    "",
                ]
            )

        add_record("Project declaration", payload["project"])
        lines.extend(["## Feature", ""])
        add_record("Feature declaration", payload["feature"])
        lines.extend(
            [
                "## Planning",
                "",
                "Tasks and acceptance criteria retain position ascending, then stable ID order.",
                "",
            ]
        )
        for index, task in enumerate(payload["planning"]["tasks"], start=1):
            add_record(f"Task {index}", task)
        for index, criterion in enumerate(payload["planning"]["acceptance_criteria"], start=1):
            add_record(f"Acceptance criterion {index}", criterion)

        for section, item_label, key, empty in (
            ("Dependencies", "Dependency", "dependencies", "No dependencies are included."),
            ("Decisions", "Decision", "decisions", "No linked decisions are included."),
            ("Invariants", "Invariant", "invariants", "No applicable invariants are included."),
        ):
            lines.extend([f"## {section}", ""])
            records = payload[key]
            if records:
                for index, record in enumerate(records, start=1):
                    add_record(f"{item_label} {index}", record)
            else:
                lines.extend([empty, ""])

        lines.extend(["## Readiness", ""])
        if payload["readiness"]:
            add_record("Saved planning evaluation", payload["readiness"])
        else:
            lines.extend(["No saved readiness evaluation.", ""])

        lines.extend(["## Git observations", ""])
        if payload["git_observations"]:
            for index, observation in enumerate(payload["git_observations"], start=1):
                add_record(f"Observation {index}", observation)
        else:
            lines.extend(["No Git observations are included.", ""])

        lines.extend(
            [
                "## Provenance and limits",
                "",
                "- Planning fields are declared product context, not delivery verification.",
                "- Git fields are read-only observations and may be historical or unavailable.",
                "- No local paths, remote URLs, credentials, source content or untracked names "
                "are exported.",
                "- A clean observation does not prove tests passed or that a release is ready.",
                "",
                "## Canonical payload",
                "",
                "The following escaped JSON is the complete deterministic payload represented "
                "by this document.",
                "",
                "<pre>",
                html.escape(canonical_json),
                "</pre>",
                "",
            ]
        )
        return "\n".join(lines)
