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

FND-03 keeps decisions and invariants as project-scoped records with immutable revision rows. Decisions can be linked to Features and superseded by an explicit successor; accepted decision edits become proposed revisions that require re-acceptance. Invariants can apply to a whole project or one Feature, and acknowledgements store the exact invariant revision reviewed after an atomic expected-revision guard. `ReadinessEngine` is a pure application-layer evaluator over a normalized SQLite snapshot. It implements rules R01-R06, includes effective decision content and supersession chains in a deterministic SHA-256 input fingerprint, and never calls Git, an LLM or an agent. Preview is not persisted; Evaluate & save stores the normalized input snapshot and result so later comparisons can report `STALE` without recomputing historical truth. Archived projects remain readable and previewable but cannot receive new saved evaluations.

FND-04 keeps `Project`, `RepositoryConnection`, `GitObservation`, `FeatureRepositoryLink` and `ContextPackage` separate. A connection stores a canonical local root and can be disconnected without deleting observations or packages. `GitObserver` uses fixed argument lists, controlled Git configuration, bounded subprocess execution and no network-capable operation. Observations are append-only metadata snapshots. `ContextPackageBuilder` receives planning records and selected observations, removes machine paths and repository details, normalizes text, sorts records, serializes canonical JSON and hashes that exact JSON. Markdown is derived from the same snapshot. Archived projects remain readable and previewable, while connections, observations, links and package saves are write-protected.

The data model keeps `Workspace`, `Project`, planning records, `Repository` and `Integration` separate. The hierarchy is `Workspace > Project > Epic > Feature > Task/AcceptanceCriterion`; a feature may remain unassigned to an epic. Dependencies carry a project key and two feature keys, and are validated in the application layer before the unique database edge index is written. Archived projects are readable but planning mutations are rejected. There is no irreversible delete workflow for planning records.

The frontend talks to the backend through the Vite `/api` proxy in development. It has no direct filesystem or Git access. Routing is local and uses React Router; the active workspace ID and theme are stored in browser local storage, while workspace/project truth stays in the backend SQLite database. Mutating API requests with an untrusted `Origin` are rejected; this is a localhost boundary, not an authentication system.

