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

FND-02 uses the same boundaries for the planning hierarchy. `domain` contains planning statuses and priorities without FastAPI; `application` contains project isolation, stable feature IDs, archive read-only policy, ordering and dependency cycle detection; `persistence` contains SQLAlchemy models, foreign keys and indexes; `api` contains nested Pydantic transport schemas and routes. Alembic owns schema creation; application imports never call `create_all` or seed data.

The data model keeps `Workspace`, `Project`, planning records, `Repository` and `Integration` separate. The hierarchy is `Workspace > Project > Epic > Feature > Task/AcceptanceCriterion`; a feature may remain unassigned to an epic. Dependencies carry a project key and two feature keys, and are validated in the application layer before the unique database edge index is written. Archived projects are readable but planning mutations are rejected. There is no irreversible delete workflow for planning records.

The frontend talks to the backend through the Vite `/api` proxy in development. It has no direct filesystem or Git access. Routing is local and uses React Router; the active workspace ID and theme are stored in browser local storage, while workspace/project truth stays in the backend SQLite database. Mutating API requests with an untrusted `Origin` are rejected; this is a localhost boundary, not an authentication system.

