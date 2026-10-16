"""Shared input normalization and clock helpers."""

from datetime import UTC, datetime

from app.application.common.errors import InvalidInput


def clean_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise InvalidInput("Name is required")
    if len(name) > 120:
        raise InvalidInput("Name must be 120 characters or fewer")
    return name


def clean_description(value: str | None) -> str | None:
    if value is None:
        return None
    description = value.strip()
    return description or None


def now() -> datetime:
    return datetime.now(UTC)


def clean_title(value: str) -> str:
    title = value.strip()
    if not title:
        raise InvalidInput("Title is required")
    if len(title) > 160:
        raise InvalidInput("Title must be 160 characters or fewer")
    return title


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None
