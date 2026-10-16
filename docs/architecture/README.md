# Forge architecture

Forge is a local-first React application backed by FastAPI and SQLite. The browser owns presentation and local navigation; the backend owns durable product records and any access to local Git. The frontend never reads the user's filesystem directly.

```text
React entry → app shell/router → feature modules → shared API transport → /api
                                                                  ↓
FastAPI routes → application services → domain rules + persistence → SQLite
```

The frontend follows feature ownership and the backend follows use-case/layer ownership. Current module boundaries and import rules are in the [frontend architecture](frontend.md) and [backend architecture](backend.md). HTTP operations and their compatibility checks are summarized in [API contracts](contracts.md) and specified in [`docs/api-contracts.md`](../api-contracts.md).

CSS ownership is split between design tokens, app-shell styles, feature styles and genuinely shared presentation rules. `frontend/src/styles/index.css` is the sole global composition point; its import order preserves the historical cascade. See [frontend styling ownership](frontend.md#css-ownership-and-order).

Architecture refactor rationale and compatibility decisions from earlier milestones remain available in [`docs/history/architecture-refactors.md`](../history/architecture-refactors.md). Quality gates and visual-baseline procedures are in [`docs/engineering/testing.md`](../engineering/testing.md).
