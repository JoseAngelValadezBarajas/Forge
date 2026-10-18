# Forge architecture

Forge is a local-first React application backed by FastAPI and SQLite. The browser owns presentation and local navigation; the backend owns durable product records and any access to local Git. The frontend never reads the user's filesystem directly.

```text
React entry → app shell/router → feature modules → shared API transport → /api
                                                                  ↓
FastAPI routes → application services → domain rules + persistence → SQLite
```

The frontend follows feature ownership and the backend follows use-case/layer ownership. Current module boundaries and import rules are in the [frontend architecture](frontend.md) and [backend architecture](backend.md). HTTP operations and their compatibility checks are summarized in [API contracts](contracts.md) and specified in [`docs/api-contracts.md`](../api-contracts.md).

## Runtime modes and platform boundaries

- **Development (implemented):** Vite serves React and proxies relative `/api` requests to FastAPI. This remains the default workflow.
- **Local distribution (implemented, opt-in):** FastAPI serves the compiled `frontend/dist` entrypoint and `/assets` from one loopback origin, alongside the unchanged `/api` routes. It requires no Vite or Node process after the frontend build. Configure `FORGE_RUNTIME_MODE=local`; the launcher accepts only a literal loopback IP in `FORGE_RUNTIME_HOST` and uses `FORGE_RUNTIME_PORT`. Every request must use that loopback `Host` and configured HTTP port; this Host restriction is a DNS-rebinding defense. Mutations additionally require the configured same-origin `Origin`; neither arbitrary `Host`, `Origin`, nor forwarded headers establish trust. The entrypoint fallback is only for browser document navigations, and API/static misses remain 404s. These checks are not authentication against arbitrary local processes, which can call loopback APIs directly.
- **Desktop (DESK-01 implementation; Windows installed-product certification pending):** Tauri 2 serves the bundled React app. A per-user packaged FastAPI sidecar binds an ephemeral loopback port; Rust owns its lifecycle, a per-launch session capability and a route-manifest-constrained API bridge. React receives only fixed Tauri IPC commands, never the token or port. SQLite, logs and migration backups live under `%LOCALAPPDATA%\Forge`; browser and development API contracts remain unchanged. See the [DESK-01 architecture and threat model](../desktop/desk-01-architecture.md) and [Windows operator/build guide](../desktop/desk-01-windows-alpha.md).
- **Hosted Web (future WEB-01):** React frontend and authenticated hosted FastAPI with isolated server-side persistence. WEB-01 owns identity, workspace authorization, tenant isolation, deployment security, server-side repository-access restrictions, and any explicitly designed optional local bridge. FND-04's local repository observer is not a hosted filesystem-access mechanism.

The browser development and opt-in local runtime remain supported. DESK-01 does not implement hosted deployment, accounts, multi-user authorization, synchronization or a generic local bridge. Installer readiness is not inferred from compilation; see the installed-product certification status in the desktop guide.

CSS ownership is split between design tokens, app-shell styles, feature styles and genuinely shared presentation rules. `frontend/src/styles/index.css` is the sole global composition point; its import order preserves the historical cascade. See [frontend styling ownership](frontend.md#css-ownership-and-order).

Architecture refactor rationale and compatibility decisions from earlier milestones remain available in [`docs/history/architecture-refactors.md`](../history/architecture-refactors.md). Quality gates and visual-baseline procedures are in [`docs/engineering/testing.md`](../engineering/testing.md).
