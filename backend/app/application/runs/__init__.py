"""Compatibility exports for the historical application.runs module."""

from typing import Any

from app.application.common.serialization import _canonical_json, _fingerprint
from app.application.common.validation import now
from app.application.handoffs.serialization import (
    HANDOFF_SCHEMA,
    _handoff_markdown,
    _handoff_payload,
    _markdown_value,
)
from app.application.runs.service import _TRANSITIONS, RUN_EVENT_TYPES, RUN_STATUSES, RunService
from app.application.runs.validation import (
    _validate_output_reference,
    clean_optional,
    clean_required,
)


def __getattr__(name: str) -> Any:
    if name in {"HANDOFF_STATUSES", "HandoffService"}:
        from app.application.handoffs import service

        return getattr(service, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "HANDOFF_SCHEMA",
    "HANDOFF_STATUSES",
    "HandoffService",
    "RUN_EVENT_TYPES",
    "RUN_STATUSES",
    "RunService",
    "_TRANSITIONS",
    "_canonical_json",
    "_fingerprint",
    "_handoff_markdown",
    "_handoff_payload",
    "_markdown_value",
    "_validate_output_reference",
    "clean_optional",
    "clean_required",
    "now",
]
