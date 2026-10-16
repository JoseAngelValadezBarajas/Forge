from fastapi import APIRouter

from app.api.routers import (
    decisions,
    evidence,
    health,
    invariants,
    planning,
    readiness,
    releases,
    repositories,
    runs,
    verifications,
    workspaces,
)

router = APIRouter(prefix="/api")

router.include_router(health.router)
router.include_router(workspaces.router)
router.include_router(planning.router)
router.include_router(decisions.router)
router.include_router(invariants.router)
router.include_router(readiness.router)
router.include_router(repositories.router)
router.include_router(runs.router)
router.include_router(evidence.router)
router.include_router(verifications.router)
router.include_router(releases.router)
