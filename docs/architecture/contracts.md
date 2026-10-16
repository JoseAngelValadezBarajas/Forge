# Frontend/API contract ownership

`frontend/src/shared/api/client.ts` owns the single browser `fetch` transport, `/api` prefixing, response parsing, HTTP errors and `AbortSignal` forwarding. Feature API modules under `frontend/src/features/*/api/` own endpoint paths, request serialization and capability DTOs. `frontend/src/api.ts` is the backwards-compatible composition facade used by existing screens; it does not implement transport or duplicate feature operations.

The backend's Pydantic models in `backend/app/api/schemas/` are the HTTP contract source. Cohesive routers in `backend/app/api/routers/` adapt requests to application services while preserving the existing route prefix, methods, status/error behavior and response headers.

The client currently characterizes 94 `forgeApi` operations; frontend tests and `scripts/verify-api-response-contracts.py` (repository verifier) cross-check requests and declared backend routes. The frozen OpenAPI/route registry tests protect method/path/schema compatibility. Existing top-level DTO discrepancies are documented in [`docs/api-contract-integrity.md`](../api-contract-integrity.md); this refactor does not resolve or suppress them.

When adding an endpoint, define its Pydantic request/response model in the owning schema module, add the route to the cohesive router and cover its behavior. Add the corresponding frontend DTO and operation to the owning feature API module; add operation-level tests for method, URL, query, body, response parsing and cancellation. Preserve the compatibility facade when existing consumers need the method. Update the frozen contract only for an explicitly approved API change, not for a frontend styling or documentation change.
