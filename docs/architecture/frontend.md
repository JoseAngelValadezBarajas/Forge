# Frontend architecture

## Ownership

- `frontend/src/main.tsx` mounts React, `BrowserRouter` and the global stylesheet.
- `frontend/src/app/App.tsx` owns the shell composition, workspace initialization/selection, persisted theme, keyboard shortcut and Command Palette focus restoration.
- `frontend/src/app/router.tsx` composes the 18 existing routes and fallback. It does not own feature data loading.
- `frontend/src/app/shell/` owns sidebar and workspace-switcher presentation. `frontend/src/app/command-palette/` owns palette presentation, command filtering, keyboard interaction and accessible dialog markup.
- `frontend/src/features/` owns capability pages, feature-specific components, hooks and API operations: workspaces, projects, planning, decisions, invariants, readiness, repositories/context packages, workbench/runs/handoffs and delivery.
- `frontend/src/shared/` contains domain-independent UI, utilities and the sole shared API transport.

The primary dependency direction is `main.tsx → app → feature public interfaces → shared`. `shared` does not import app or features; feature modules do not import `app`; cross-feature UI consumers import only a documented feature `index.ts` interface. Runtime cycles are forbidden. `src/api.ts` remains the compatibility facade for existing DTOs and operations; it does not own another `fetch` implementation.

## CSS ownership and order

`frontend/src/styles/index.css` is imported once by `main.tsx`. The token source is `frontend/src/styles/tokens.css`; `base.css`, `forms.css`, `pages.css`, `records.css`, `history.css` and `layout-responsive.css` own truly shared rules. Shell styles live beside the shell in `app/shell/`; Command Palette styles live beside that component; capability styles live in their feature directories. Readiness has its own base and responsive stylesheets because those rules are separated in the original cascade.

The index intentionally composes stylesheets in this order:

1. Tokens and base element rules.
2. Shell base, shared forms, shell navigation and header.
3. Projects and shared page rules.
4. Command Palette and planning board.
5. Shared record rules, Readiness, shared history and repository/context styles.
6. Readiness responsive rules, Feature Detail planning rules and Workbench.
7. Shared responsive layout and Delivery.

The exact import sequence is authoritative in `styles/index.css`: it retains the prior `styles.css` source order so equal-specificity rules, responsive overrides and themes resolve as before. Do not reorder imports as a cleanup. Put new capability selectors with their owning feature; add a shared selector only when it is genuinely reused and domain-independent. Keep token values in `tokens.css`, consume CSS variables, preserve existing classes and use the existing focus/semantic variables. Avoid duplicate global selectors and CSS rules in component files.

## State and API access

Workspace selection and theme preference are local-storage preferences. Projects, planning records, repositories, runs, handoffs and delivery records come from the backend. Components own transient form/filter state; feature hooks own feature-local loading and cancellation. `shared/api/client.ts` owns HTTP transport and error conversion; capability API modules own endpoint calls and DTOs. See [contract ownership](contracts.md).

## Adding a feature

Place UI, local hooks, capability API contracts and CSS in `features/<capability>/`. Export only the route/page surface and any intentionally shared consumer from `index.ts`; compose routes in `app/router.tsx`. Add accessible behavior tests, API operation contract coverage where needed, and a Playwright journey for important workflows. Promote a component or CSS selector to `shared` only when its interface is stable and it is domain-independent. Run the architecture checker and [frontend quality gates](../engineering/testing.md#frontend).
