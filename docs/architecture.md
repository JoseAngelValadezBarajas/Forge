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

FND-00 intentionally leaves future layers empty. It provides environment settings, a SQLite engine, Alembic wiring, structured JSON logging and `GET /api/health`.

The frontend talks to the backend through the Vite `/api` proxy in development. It has no direct filesystem or Git access. Routing is local and uses React Router; theme state is stored in browser local storage only.

