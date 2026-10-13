from app.application.services import ensure_local_workspace
from app.db import SessionLocal


def initialize_local_workspace() -> str:
    """Explicitly seed the default workspace after migrations have run."""
    with SessionLocal() as session:
        return ensure_local_workspace(session).id


if __name__ == "__main__":
    print(initialize_local_workspace())
