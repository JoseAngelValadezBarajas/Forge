"""Deterministic serialization for immutable published handoff revisions."""

import html

from app.application.common.serialization import _canonical_json, _fingerprint
from app.persistence.models import ContextPackageModel, HandoffModel

HANDOFF_SCHEMA = "forge-handoff-v1"

__all__ = [
    "HANDOFF_SCHEMA",
    "_canonical_json",
    "_fingerprint",
    "_handoff_markdown",
    "_handoff_payload",
    "_markdown_value",
]


def _markdown_value(value: str) -> str:
    return html.escape(value, quote=False).replace("\r\n", "\n").replace("\r", "\n")


def _handoff_payload(
    handoff: HandoffModel, revision: int, package: ContextPackageModel
) -> dict[str, object]:
    return {
        "schema": HANDOFF_SCHEMA,
        "handoff_id": handoff.id,
        "revision": revision,
        "project_id": handoff.project_id,
        "feature_id": handoff.feature_id,
        "run_id": handoff.run_id,
        "source_context": {
            "package_id": package.id,
            "schema_version": package.schema_version,
            "fingerprint": package.fingerprint,
        },
        "content": {
            "title": handoff.title,
            "summary": handoff.summary,
            "outcomes": handoff.outcomes,
            "blockers": handoff.blockers,
            "questions": handoff.questions,
            "next_actions": handoff.next_actions,
            "references": handoff.references,
        },
        "provenance": {
            "origin": "manual",
            "reported": True,
            "observed": False,
            "verified": False,
        },
    }


def _handoff_markdown(payload: dict[str, object]) -> str:
    content = payload["content"]
    assert isinstance(content, dict)
    source = payload["source_context"]
    assert isinstance(source, dict)
    provenance = payload["provenance"]
    assert isinstance(provenance, dict)

    def block(label: str, value: object) -> list[str]:
        return [f"## {label}", "", "<pre>", _markdown_value(str(value)), "</pre>", ""]

    metadata = [
        ("schema", payload["schema"]),
        ("handoff_id", payload["handoff_id"]),
        ("revision", payload["revision"]),
        ("project_id", payload["project_id"]),
        ("feature_id", payload["feature_id"]),
        ("run_id", payload["run_id"]),
        ("source_context.package_id", source["package_id"]),
        ("source_context.schema_version", source["schema_version"]),
        ("source_context.fingerprint", source["fingerprint"]),
        ("provenance.origin", provenance["origin"]),
        ("provenance.reported", provenance["reported"]),
        ("provenance.observed", provenance["observed"]),
        ("provenance.verified", provenance["verified"]),
    ]
    lines = ["# Forge Handoff", ""]
    lines.extend(block("Title", content["title"]))
    lines.extend(["## Metadata", "", "<pre>"])
    lines.extend(f"{label}: {_markdown_value(str(value))}" for label, value in metadata)
    lines.extend(["</pre>", ""])
    for label, key in (
        ("Summary", "summary"),
        ("Reported outcomes", "outcomes"),
        ("Blockers", "blockers"),
        ("Open questions", "questions"),
        ("Next actions", "next_actions"),
        ("References", "references"),
    ):
        lines.extend(block(label, content[key]))
    lines.extend(
        [
            "> Reported context only. This handoff is not proof of implementation, tests, CI, "
            "or release correctness.",
            "",
        ]
    )
    return "\n".join(lines)
