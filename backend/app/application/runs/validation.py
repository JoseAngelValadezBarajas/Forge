"""Validation for manually declared run outputs."""

import re
from urllib.parse import urlsplit

from app.application.common.errors import InvalidInput
from app.application.common.validation import clean_optional


def _validate_output_reference(reference_kind: str, reference_value: str | None) -> str | None:
    """Validate declared output references without resolving them.

    Output references are claims recorded for human review. They are never opened,
    fetched, or interpreted as local files by this service.
    """

    value = clean_optional(reference_value, 500)
    if not value:
        if reference_kind in {"safe_link", "commit", "artifact"}:
            raise InvalidInput(f"A reference value is required for {reference_kind} outputs")
        return None
    if any(ord(character) < 32 for character in value):
        raise InvalidInput("Output references cannot contain control characters")

    if reference_kind == "safe_link":
        try:
            parsed = urlsplit(value)
            hostname = parsed.hostname
        except ValueError as exc:
            raise InvalidInput("Safe links must be valid HTTP or HTTPS URLs") from exc
        if parsed.scheme.lower() not in {"http", "https"} or not hostname:
            raise InvalidInput("Safe links must use HTTP or HTTPS")
        if parsed.username is not None or parsed.password is not None:
            raise InvalidInput("Safe links cannot contain embedded credentials")
        return value

    if reference_kind == "commit":
        if not re.fullmatch(r"[0-9a-fA-F]{7,64}", value):
            raise InvalidInput("Commit references must be hexadecimal commit identifiers")
        return value

    if reference_kind == "artifact":
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,199}", value):
            raise InvalidInput("Artifact references must be opaque identifiers, not paths or URLs")
        return value

    if reference_kind == "label":
        lowered = value.lower()
        if (
            "\\" in value
            or "/" in value
            or "://" in value
            or lowered.startswith(("file:", "javascript:", "data:"))
            or re.match(r"^[A-Za-z]:", value)
        ):
            raise InvalidInput("Labels cannot contain paths, URLs, or executable schemes")
        return value

    raise InvalidInput("Output reference kind is not supported")
