"""Input validation and safe normalization shared by Delivery use cases."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit

from app.application.common.errors import InvalidInput


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _unique(values: list[str]) -> list[str]:
    if len(values) != len(set(values)):
        raise InvalidInput("Selection contains duplicate identifiers")
    return sorted(values)


def _clean(value: str, field: str, limit: int) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise InvalidInput(f"{field} is required")
    if len(cleaned) > limit:
        raise InvalidInput(f"{field} must be {limit} characters or fewer")
    if any(ord(character) < 32 and character not in "\n\t" for character in cleaned):
        raise InvalidInput(f"{field} cannot contain control characters")
    return cleaned


def _portable_text(value: str | None) -> str | None:
    """Keep user text useful while omitting common local path and credential forms."""
    if value is None:
        return None
    cleaned = re.sub(
        r"(?i)\b[A-Z]:[\\/][^\s,;]+|\\\\[^\s,;]+|/(?:Users|home|private|tmp|var)/[^\s,;]+",
        "[local path omitted]",
        value,
    )
    return re.sub(r"(?i)\b(token|password|secret|api[_-]?key)=([^\s&]+)", r"\1=[redacted]", cleaned)


def _validate_reference(kind: str, raw: str | None) -> str | None:
    value = raw.strip() if raw else ""
    if kind == "manual":
        if value:
            raise InvalidInput("Manual attestations do not accept source references")
        return None
    if not value:
        raise InvalidInput("A source reference is required")
    if any(ord(character) < 32 for character in value):
        raise InvalidInput("Source references cannot contain control characters")
    if kind == "safe_link":
        try:
            parsed = urlsplit(value)
            host = parsed.hostname
            _ = parsed.port
        except ValueError as exc:
            raise InvalidInput("Use a valid HTTP or HTTPS URL without credentials") from exc
        if parsed.scheme.lower() not in {"http", "https"} or not host:
            raise InvalidInput("Only HTTP and HTTPS references are accepted")
        if parsed.username is not None or parsed.password is not None:
            raise InvalidInput("URLs cannot contain embedded credentials")
        return value
    if kind == "artifact" and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,199}", value):
        return value
    if kind == "commit" and re.fullmatch(r"[0-9a-fA-F]{7,64}", value):
        return value.lower()
    if kind in {"context_package", "git_observation", "handoff_revision"}:
        if not re.fullmatch(r"[A-Fa-f0-9-]{36}", value):
            raise InvalidInput("Internal references must be UUID identifiers")
        return value
    raise InvalidInput("Reference does not match its source kind")
