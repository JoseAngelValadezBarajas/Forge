# Backend architecture

The backend is organized around inward dependencies:

```text
FastAPI routes/schemas → application use cases → domain rules
                                          ↘ persistence models/repositories
```

- `backend/app/api/` owns HTTP routing, Pydantic transport contracts, error translation and response serialization. `routes.py` composes cohesive routers under the existing `/api` prefix.
- `backend/app/application/` owns use cases and transaction orchestration. Shared input/error behavior is in `common/`; planning, decisions, invariants, readiness, repositories/context, runs/handoffs and Delivery keep their respective capability owners.
- `backend/app/domain/` contains framework-independent product rules and deterministic evaluation logic.
- `backend/app/persistence/` contains SQLAlchemy models and persistence adapters. Alembic in `backend/migrations/` owns schema changes; application imports do not call `create_all` or seed data.
- `backend/app/git/` contains the bounded read-only local Git observer. Repository trust roots are revalidated before new observations; historical records remain readable.

The domain does not depend on FastAPI. Persistence and domain modules do not depend on application or API. API routes translate HTTP input and call application services; they do not own business rules or transaction boundaries. Compatibility facades for historical service imports are documented in the [architecture history](../history/architecture-refactors.md).

The opt-in local distribution runtime is composed in `app/main.py` and launched by `python -m app.local_runtime`. It mounts only compiled files from the frontend build's `assets` directory and serves `index.html` for browser document navigations outside `/api` and `/assets`. The build is validated before the app reports startup complete. The launcher requires a literal loopback IP. `TrustedHostMiddleware` restricts the hostname, with an additional check for exactly one syntactically valid `Host` authority on the configured HTTP port; this guards against DNS rebinding. The mutation Origin policy is derived from configured runtime host/port, never from request or forwarded headers. These checks do not authenticate arbitrary local processes. Development mode keeps the existing Vite origin allowlist and workflow.

## Deterministic snapshots and serialization

Deterministic records are owned by their application capability, not by HTTP routes or React: Context Packages normalize and canonicalize planning/Git inputs before fingerprinting; Handoffs serialize immutable published revisions in `application/handoffs/serialization.py`; Delivery canonical JSON and fingerprint helpers live in `application/delivery/serialization.py`; Readiness stores the normalized input snapshot used for its evaluation. Routes map and return these records, including existing download headers, without reconstructing historical content. Keep snapshot versions, canonicalization inputs and hashing rules with their owning capability and preserve published history as immutable.

Backend layer rules and cycle checks are enforced by `backend/architecture/check_application_boundaries.py`. OpenAPI and route behavior are frozen and checked by `backend/tests/test_api_contracts.py`. Run Ruff, strict mypy, pytest and Alembic checks as documented in [`docs/engineering/testing.md`](../engineering/testing.md#backend).
