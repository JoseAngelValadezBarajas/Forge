import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path, PurePosixPath

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import FileResponse, PlainTextResponse, Response
from starlette.staticfiles import StaticFiles

from app.api.routes import router
from app.config import Settings, get_settings
from app.local_runtime import (
    has_valid_local_host_header,
    is_browser_navigation,
    local_runtime_host,
    local_runtime_origin,
    validate_frontend_build,
    validate_local_runtime_settings,
)
from app.logging_config import configure_logging

logger = logging.getLogger(__name__)


def _frontend_origins(settings: Settings) -> set[str]:
    if settings.runtime_mode == "local":
        return {local_runtime_origin(settings)}
    frontend_origin = settings.frontend_origin
    return {
        frontend_origin.rstrip("/"),
        frontend_origin.replace("localhost", "127.0.0.1").rstrip("/"),
    }


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime_settings = settings or get_settings()
    local_mode = runtime_settings.runtime_mode == "local"
    origins = _frontend_origins(runtime_settings)
    index_path: Path | None = None
    assets_path: Path | None = None

    if local_mode:
        validate_local_runtime_settings(runtime_settings)
        dist_path = runtime_settings.frontend_dist_dir.expanduser().resolve()
        index_path = dist_path / "index.html"
        assets_path = dist_path / "assets"

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        configure_logging(runtime_settings.log_level)
        if local_mode:
            assert index_path is not None and assets_path is not None
            validate_frontend_build(index_path.parent)
        logger.info(
            "forge_started",
            extra={
                "environment": runtime_settings.environment,
                "runtime_mode": runtime_settings.runtime_mode,
            },
        )
        yield
        logger.info("forge_stopped")

    application = FastAPI(
        title=runtime_settings.app_name,
        version=runtime_settings.app_version,
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )
    application.include_router(router)

    @application.middleware("http")
    async def same_origin_mutations(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if local_mode and not has_valid_local_host_header(
            request.scope["headers"], runtime_settings
        ):
            return PlainTextResponse("Invalid host header", status_code=400)
        if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
            origin = request.headers.get("origin")
            if local_mode and (origin is None or origin.rstrip("/") not in origins):
                return JSONResponse(
                    status_code=403, content={"detail": "Same-origin mutation required"}
                )
            if origin and origin.rstrip("/") not in origins:
                return JSONResponse(
                    status_code=403, content={"detail": "Cross-origin mutation denied"}
                )
        return await call_next(request)

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_request_error", extra={"path": request.url.path}, exc_info=exc)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    if local_mode:
        assert index_path is not None and assets_path is not None
        application.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=[local_runtime_host(runtime_settings)],
            www_redirect=False,
        )
        application.mount(
            "/assets",
            StaticFiles(directory=assets_path, check_dir=False, follow_symlink=False),
            name="compiled-assets",
        )

        @application.get("/", include_in_schema=False)
        async def local_frontend_root(request: Request) -> FileResponse:
            if not is_browser_navigation(request):
                raise HTTPException(status_code=404, detail="Not Found")
            return FileResponse(index_path, media_type="text/html")

        @application.api_route(
            "/{path:path}", methods=["GET", "HEAD"], include_in_schema=False
        )
        async def local_frontend_navigation(path: str, request: Request) -> FileResponse:
            if path == "api" or path.startswith("api/"):
                raise HTTPException(status_code=404, detail="Not Found")
            if not is_browser_navigation(request) or PurePosixPath(path).suffix:
                raise HTTPException(status_code=404, detail="Not Found")
            return FileResponse(index_path, media_type="text/html")

    return application


app = create_app()

