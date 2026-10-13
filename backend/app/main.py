import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.responses import Response

from app.api.routes import router
from app.config import get_settings
from app.logging_config import configure_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("forge_started", extra={"environment": settings.environment})
    yield
    logger.info("forge_stopped")


settings = get_settings()
app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)
frontend_origins = {
    settings.frontend_origin.rstrip("/"),
    settings.frontend_origin.replace("localhost", "127.0.0.1").rstrip("/"),
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(frontend_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(router)


@app.middleware("http")
async def same_origin_mutations(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") not in frontend_origins:
            return JSONResponse(status_code=403, content={"detail": "Cross-origin mutation denied"})
    return await call_next(request)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_request_error", extra={"path": request.url.path}, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

