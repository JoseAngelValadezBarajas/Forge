# UI-RFX-01 · Complete reusable component library

## Scope

UI-RFX-01 establishes the reusable internal UI capability for Forge. It does
not redesign product pages, change routes or change backend/API behavior.
The goal is a code-backed library with explicit contracts, shared CSS
ownership, real consumer adoption, an accessible developer catalog and
repeatable Chromium evidence.

## Delivered

- Foundations remain graphite/copper and are documented in `tokens.css`:
  backgrounds, surfaces, borders, typography, spacing, radii, semantic colors,
  focus, responsive conventions and reduced-motion behavior.
- Shared primitives cover actions, form controls, surfaces, badges, tabs and
  generic breadcrumbs.
- Composed components cover metrics, statuses, section headings and feedback
  states.
- `MetricCard` styles moved from Projects into `shared/ui/styles.css` without
  changing the existing DOM contract.
- `StatusChip` now keeps domain status, display label and visual variant
  conceptually separate, while retaining existing Workbench and Delivery CSS
  hooks and neutral fallback behavior.
- Projects, Planning, Decisions, Delivery and Workbench use shared controls in
  representative real flows. Product-specific empty/loading/error states stay
  local where their semantics differ.
- `ProjectBreadcrumbs` is now an adapter over generic `Breadcrumbs`; project
  overview and Delivery navigation use shared `Tabs`.
- The development-only `/__component-gallery` route demonstrates the actual
  components in dark/light themes, states and responsive layouts. It contains
  no live product data or external service calls and is removed from production
  routing by the Vite development guard.

## Visual reference

The Figma source of truth is `r10szKLgiIPVi2NBmbjTpm`. The connected reader
returned the Workspace Home, Project Overview, Project Board, Feature Detail,
Project Repositories, Mobile Context Summary and Workbench frames. The direct
`1:5` selection was unavailable through the reader, so this work does not
claim pixel-perfect certification against that node.

## Gallery evidence

The real Chromium catalog run writes deterministic screenshots to the ignored
Playwright test-results directory:

- `component-gallery-dark.png` at 1440×900.
- `component-gallery-light.png` at 1440×900.
- `component-gallery-mobile-dark.png` at 390×844 viewport.

The inspected captures show contained cards, readable wrapping, visible focus
rules from the shared base styles and no unexpected document-level horizontal
overflow at the mobile viewport. The browser reported no console errors.

## Compatibility and non-goals

No API client, HTTP contract, backend, database, Tauri transport, route
behavior or feature workflow changed. Existing feature CSS hooks remain in
place. UI-RFX-02 remains deferred: no broad page redesign, localization pass,
Board containment redesign or new capability was started.

## Certification record

Focused evidence from this implementation:

- Shared UI and Gallery Vitest: PASS (`29` tests across six focused suites).
- TypeScript strict check: PASS.
- ESLint: PASS after the final consumer migration.
- Architecture checker: PASS; shared UI has no feature/app imports.
- Component Gallery Chromium: PASS (`1` test), including dark/light desktop,
  mobile screenshot, overflow and console-error assertions.
- Full Chromium E2E: PASS (`23` passed, `1` skipped); visual baselines: PASS.
- E2E isolation negative check: PASS; the pre-existing server received no
  writes.
- Backend Ruff, strict mypy and pytest: PASS (`181` passed, `2` skipped).
- Secret audit: executed against the reachable Git history, index and
  non-ignored working-tree files; final result is reported with the delivery
  commit evidence.
- Aggregate `npm run test` and `npm run test:coverage`: Vitest, architecture,
  contracts and coverage passed; the existing Desktop Cargo.lock CRLF
  assertion remains the single failing aggregate check.
- Coverage denominator: 2,656 instrumented statements and 2,389 instrumented
  lines; the implementation reports 73% statements and 74% lines without
  changing exclusions.

The existing aggregate `npm run test` Cargo.lock CRLF assertion remains a
separate documented issue; this UI-RFX-01 work did not alter the Rust lockfile.
The full visual-baseline suite also passes; the known mobile Board horizontal
overflow is preserved as an existing product-surface limitation and is not
introduced by the component library.
