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

FND-05 adds `AgentRun`, append-only `RunEvent` and structured `RunOutputReference` records, plus `Handoff`, immutable `HandoffRevision` and explicit `HandoffAcknowledgement` rows. Runs pin a same-Feature Context Package and use application-layer transition rules with atomic optimistic version checks. Published handoffs use canonical `forge-handoff-v1` JSON, escaped Markdown and a deterministic fingerprint. Acknowledgements carry the exact expected revision and reject stale or withdrawn content. These records are reported planning history only; no agent, provider, process, filesystem or delivery verification is executed.

FND-06 adds project-scoped Evidence Records, immutable verification snapshots, revisioned Release Candidates, gate evaluations and versioned manifests. `DeliveryService` preserves REPORTED versus OBSERVED evidence provenance; named deterministic verification rules cannot elevate the underlying declaration. Gates evaluate a frozen selection and return only `READY_BY_DEFINED_GATES`, `BLOCKED` or derived `STALE`. The canonical JSON manifest and escaped Markdown export identify exact scope and limitations and remain `NOT_PUBLISHED`. Artifact bytes are not imported, external URLs are not fetched, and no tests, CI, Git writes or deployments are run by this slice.

### FND-06 Delivery backend boundaries

The application import remains `from app.application.delivery import DeliveryService`, implemented as a compatibility package facade. The facade owns no use-case rules: it creates focused services over one request-scoped `DeliveryContext` and forwards calls to them.

| Module | Responsibility |
| --- | --- |
| `delivery/evidence.py` | Evidence lifecycle, source ownership and provenance |
| `delivery/verification.py` | Persisted V01–V04 preview/evaluate/history and staleness |
| `delivery/candidates.py` | Candidate selection, revisioning, freezing and frozen snapshots |
| `delivery/gates.py` | G01–G06 previews, persisted evaluations and historical status |
| `delivery/manifests.py` | Manifest completeness, persistence and Markdown export |
| `delivery/serialization.py` | Canonical JSON, SHA-256 helpers and API response mapping |
| `delivery/validation.py` / `constants.py` | Shared safe input rules and versioned identifiers |
| `delivery/base.py` | Shared SQLAlchemy session, project scope and common access checks |

Dependencies flow from the facade to use-case services. Gates receive the candidate and verification services they need; manifest persistence receives candidate access. Pure deterministic verification algorithms stay in `domain/verification.py`; the application verification service loads and persists their inputs/results. No FastAPI transport code is imported into these services.

The route layer creates the facade with its existing SQLAlchemy `Session`. The context and all use-case services share that exact session; the facade/context do not commit. Existing use-case commit, refresh and optimistic-check locations remain the transaction boundaries. Canonical JSON options, timestamp formatting, SHA-256 inputs, ruleset/schema versions and stored snapshot formats are unchanged. This is a code-only reorganization: no model field or Alembic migration changes are required. Future Delivery use cases belong in the matching responsibility module; a new boundary should be added only when it has a distinct owner and dependency need.

### RFX-01B FastAPI presentation boundaries

`app.api.routes.router` remains the public router import and only composes domain routers under the existing `/api` prefix. Shared service-error translation lives in `app.api.errors`; endpoint modules continue to use the existing `get_db` dependency and application services, which retain their transaction boundaries.

| Router | HTTP responsibility |
| --- | --- |
| `routers/health.py` | Health check |
| `routers/workspaces.py` | Workspace and Project lifecycle |
| `routers/planning.py` | Overview, Epics, Features, Tasks, criteria and dependencies |
| `routers/decisions.py` / `invariants.py` | Decision history/links; scoped invariants and acknowledgements |
| `routers/readiness.py` | Preview, saved evaluation and history |
| `routers/repositories.py` | Repository observations, Feature links and Context Packages |
| `routers/runs.py` | Runs, events, output references and Handoffs |
| `routers/evidence.py` / `verifications.py` | Evidence lifecycle; deterministic verification |
| `routers/releases.py` | Release Candidates, gates and manifests |

Pydantic transport models are defined once in `app.api.schemas` domain modules and re-exported by `app.api.schemas` for import compatibility.

| Schema module | Model ownership |
| --- | --- |
| `schemas/workspaces.py` | Workspace and Project |
| `schemas/planning.py` | Epics, Features, Tasks, Acceptance Criteria, Dependencies and overview |
| `schemas/decisions.py` / `invariants.py` | Decision revisions; Invariant revisions and acknowledgements |
| `schemas/readiness.py` | Readiness references, blockers, results and evaluations |
| `schemas/repositories.py` | Repository, observation, Feature link and Context Package |
| `schemas/runs.py` / `handoffs.py` | Runs, events, output references; Handoff, revisions and acknowledgements |
| `schemas/delivery.py` | Evidence, Verification, Release Candidate, Gate and Manifest |

Keep routes as HTTP adapters: parse and validate transport input, invoke an application service, serialize its result and translate expected errors. Do not move business rules or transaction ownership into routers.

The frozen `backend/tests/fixtures/rfx01b-openapi-baseline.json` and `rfx01b-route-registry-baseline.json` were captured from main before this extraction. `backend/tests/test_api_contracts.py` compares the complete OpenAPI document and effective runtime route order/metadata, and checks static route resolution and public schema identity. For a new endpoint, define its request/response schemas in the owning schema module, add the route to the cohesive router, include that router from `routes.py` without changing its `/api` prefix, and extend the contract/behavior tests. Preserve `get_db` identity, status/error semantics, path order where static routes can conflict, response headers and download behavior; no migration is needed for transport-only changes.

The data model keeps `Workspace`, `Project`, planning records, `Repository` and `Integration` separate. The hierarchy is `Workspace > Project > Epic > Feature > Task/AcceptanceCriterion`; a feature may remain unassigned to an epic. Dependencies carry a project key and two feature keys, and are validated in the application layer before the unique database edge index is written. Archived projects are readable but planning mutations are rejected. There is no irreversible delete workflow for planning records.

The frontend talks to the backend through the Vite `/api` proxy in development. It has no direct filesystem or Git access. Routing is local and uses React Router; the active workspace ID and theme are stored in browser local storage, while workspace/project truth stays in the backend SQLite database. Mutating API requests with an untrusted `Origin` are rejected; this is a localhost boundary, not an authentication system.

### Frontend shell, routes and Command Palette (RFX-02B)

`frontend/src/main.tsx` remains the Vite entrypoint and owns React root mounting, `BrowserRouter` and the global stylesheet. `frontend/src/app/App.tsx` owns the application shell, workspace initialization/selection, theme persistence, global keyboard shortcut and palette open/focus-restoration state. It composes the sidebar, route tree and Command Palette; feature page implementations and API contracts remain in their existing modules.

`frontend/src/app/router.tsx` owns the existing 18 route declarations, their project/feature parameters, the nested Delivery path and the fallback route. It composes the current page exports from `pages.tsx`, `planning.tsx` and `fnd03.tsx`–`fnd06.tsx`; it does not own page data loading or change URL contracts.

`frontend/src/app/command-palette/CommandPalette.tsx` owns the command list, project/feature-aware destination resolution, accessible dialog presentation, keyboard selection and local navigation. It receives close and workspace-change callbacks from the shell so focus restoration and workspace switching remain shell responsibilities. The palette does not call the backend directly.

The dependency direction for this slice is `main.tsx → app/App.tsx → app/router.tsx → existing page modules`; `app/App.tsx` also composes the sidebar and Command Palette. Existing feature modules are not moved and continue to use the current flat API/UI modules. No compatibility `src/App.tsx` wrapper is retained because the entrypoint and tests import `app/App.tsx` directly.

Later RFX-02 phases intentionally own feature-page decomposition, per-feature API/type boundaries, shared UI extraction, styling ownership and automated enforcement of module boundaries. This change adds no providers, state-management layer, runtime dependency, backend change or HTTP contract change.

