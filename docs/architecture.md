# Architecture

Forge is split into a local FastAPI backend and a React frontend.

The backend is organized by responsibility:

- `domain`: business concepts and rules; no FastAPI dependency.
- `application`: use cases and orchestration.
- `persistence`: SQLAlchemy models and repositories.
- `git`: local Git observation adapters.
- `context`: deterministic context package work.
- `handoffs`: human/agent handoff adapters.
- `api`: HTTP routes and transport concerns.

FND-01 uses the same boundaries for real workspace and project records. `domain` contains status and entity concepts without FastAPI; `application` contains validation, duplicate-name policy, archive/restore and explicit default-workspace initialization; `persistence` contains SQLAlchemy models and repositories; `api` contains Pydantic transport schemas and routes. Alembic owns schema creation; application imports never call `create_all` or seed data.

The data model keeps `Workspace`, `Project`, `Repository` and `Integration` separate. A project has a required workspace foreign key but no repository path, Git identifier or integration field. Project reads always include the workspace key, so a project cannot be read through another workspace's route.

The frontend talks to the backend through the Vite `/api` proxy in development. It has no direct filesystem or Git access. Routing is local and uses React Router; the active workspace ID and theme are stored in browser local storage, while workspace/project truth stays in the backend SQLite database. Mutating API requests with an untrusted `Origin` are rejected; this is a localhost boundary, not an authentication system.

