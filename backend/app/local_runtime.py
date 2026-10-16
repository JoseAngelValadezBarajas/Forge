"""Single-origin local distribution runtime helpers and launcher."""

import sys
from collections.abc import Sequence
from html.parser import HTMLParser
from ipaddress import IPv6Address, ip_address
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

from fastapi import Request

from app.config import Settings, get_settings


class _BuildAssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.javascript: list[str] = []
        self.stylesheets: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "script" and attributes.get("src"):
            self.javascript.append(str(attributes["src"]))
        if tag == "link" and "stylesheet" in (attributes.get("rel") or "").split():
            if attributes.get("href"):
                self.stylesheets.append(str(attributes["href"]))


def validate_local_runtime_settings(settings: Settings) -> None:
    if settings.runtime_mode != "local":
        return
    try:
        address = ip_address(settings.runtime_host)
    except ValueError as exc:
        raise RuntimeError(
            "FORGE_RUNTIME_HOST must be a loopback IP address in local runtime mode"
        ) from exc
    if not address.is_loopback or (
        isinstance(address, IPv6Address) and address.scope_id is not None
    ):
        raise RuntimeError(
            "FORGE_RUNTIME_HOST must be an unscoped loopback IP address in local runtime mode"
        )
    if not 1 <= settings.runtime_port <= 65535:
        raise RuntimeError("FORGE_RUNTIME_PORT must be between 1 and 65535")


def local_runtime_origin(settings: Settings) -> str:
    validate_local_runtime_settings(settings)
    host = local_runtime_host(settings)
    port = "" if settings.runtime_port == 80 else f":{settings.runtime_port}"
    return f"http://{host}{port}"


def local_runtime_host(settings: Settings) -> str:
    """Return the canonical Host hostname for the configured loopback address."""
    validate_local_runtime_settings(settings)
    address = ip_address(settings.runtime_host)
    host = address.compressed
    return f"[{host}]" if address.version == 6 else host


def has_valid_local_host_header(
    headers: Sequence[tuple[bytes, bytes]], settings: Settings
) -> bool:
    """Require one unambiguous HTTP Host authority on the configured port."""
    host_values = [value for name, value in headers if name.lower() == b"host"]
    if len(host_values) != 1:
        return False

    try:
        raw_host = host_values[0].decode("ascii")
        if not raw_host or raw_host != raw_host.strip():
            return False
        authority = urlsplit(f"//{raw_host}")
        if (
            authority.netloc != raw_host
            or authority.path
            or authority.query
            or authority.fragment
            or authority.netloc.endswith(":")
        ):
            return False
        supplied_port = authority.port
    except (UnicodeDecodeError, ValueError):
        return False

    if supplied_port is None:
        return settings.runtime_port == 80
    return supplied_port == settings.runtime_port


def is_browser_navigation(request: Request) -> bool:
    if request.method not in {"GET", "HEAD"}:
        return False
    accepts_html = any(
        item.split(";", maxsplit=1)[0].strip().lower()
        in {"text/html", "application/xhtml+xml"}
        for item in request.headers.get("accept", "").split(",")
    )
    return (
        accepts_html
        and request.headers.get("sec-fetch-mode", "").lower() == "navigate"
        and request.headers.get("sec-fetch-dest", "").lower() == "document"
    )


def _resolve_build_reference(reference: str, assets_root: Path) -> Path:
    parsed = urlsplit(reference)
    if parsed.scheme or parsed.netloc or not parsed.path.startswith("/assets/"):
        raise RuntimeError("Frontend build contains a non-local or invalid asset reference")
    decoded = unquote(parsed.path.removeprefix("/assets/"))
    if "\\" in decoded or "\x00" in decoded:
        raise RuntimeError("Frontend build contains an unsafe asset reference")
    parts = PurePosixPath(decoded).parts
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise RuntimeError("Frontend build contains an unsafe asset reference")
    try:
        asset_path = assets_root.joinpath(*parts).resolve(strict=True)
    except (OSError, RuntimeError, UnicodeError) as exc:
        raise RuntimeError(f"Frontend build asset is missing: {reference}") from exc
    if not asset_path.is_relative_to(assets_root.resolve()) or not asset_path.is_file():
        raise RuntimeError(f"Frontend build asset is invalid: {reference}")
    return asset_path


def validate_frontend_build(dist_directory: Path) -> None:
    try:
        dist_root = dist_directory.resolve(strict=True)
        index_path = dist_root / "index.html"
        raw_assets_root = dist_root / "assets"
        if (
            not dist_root.is_dir()
            or index_path.is_symlink()
            or not index_path.is_file()
            or raw_assets_root.is_symlink()
        ):
            raise RuntimeError("Frontend build must contain regular index.html and assets files")
        assets_root = raw_assets_root.resolve(strict=True)
        if not assets_root.is_relative_to(dist_root) or not assets_root.is_dir():
            raise RuntimeError("Frontend build must contain index.html and an assets directory")
        markup = index_path.read_text(encoding="utf-8")
    except (OSError, RuntimeError) as exc:
        raise RuntimeError(
            f"Local runtime frontend build is unavailable or invalid at {dist_directory}: {exc}"
        ) from exc

    parser = _BuildAssetParser()
    parser.feed(markup)
    if not parser.javascript or not parser.stylesheets:
        raise RuntimeError("Frontend build index.html must reference compiled JavaScript and CSS")
    references = [*parser.javascript, *parser.stylesheets]
    resolved_assets = [_resolve_build_reference(reference, assets_root) for reference in references]
    if not any(path.suffix == ".js" for path in resolved_assets):
        raise RuntimeError("Frontend build does not reference a JavaScript bundle")
    if not any(path.suffix == ".css" for path in resolved_assets):
        raise RuntimeError("Frontend build does not reference a CSS bundle")


def main() -> None:
    settings = get_settings()
    if settings.runtime_mode != "local":
        print("Set FORGE_RUNTIME_MODE=local to start the single-origin runtime.", file=sys.stderr)
        raise SystemExit(2)
    validate_local_runtime_settings(settings)
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.runtime_host,
        port=settings.runtime_port,
        reload=False,
    )


if __name__ == "__main__":
    main()
