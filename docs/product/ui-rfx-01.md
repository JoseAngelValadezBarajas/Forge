# UI-RFX-01 · Design system and visual architecture

## Scope

UI-RFX-01 is a focused frontend architecture pass. It improves reuse and
visual consistency without redesigning Feature Detail, changing routes or
changing backend/API behavior.

## Implemented

- A shared `MetricCard` preserves the existing metric-card DOM and supports
  the semantic `article` used by Delivery.
- A shared `StatusChip` preserves status classes, feature-specific styling
  hooks and explicit labels. Workbench and Delivery provenance now consume the
  same shared primitive.
- Existing typography values are represented by `--font-ui` and
  `--font-mono`; the graphite/copper values and stylesheet import order remain
  unchanged.
- The component inventory records shared ownership and explains why loading,
  error, empty and compact planning metrics remain local.

## Visual reference

The Figma source of truth is `r10szKLgiIPVi2NBmbjTpm`. The connected reader
returned the Workspace Home, Project Overview, Project Board, Feature Detail,
Project Repositories, Mobile Context Summary and Workbench frames. The direct
`1:5` selection was unavailable through the reader, so this work does not claim
pixel-perfect certification against that node.

## Compatibility

No API client, HTTP contract, route, backend, database, Tauri transport or
feature workflow changed. Existing feature CSS class hooks remain in place.

## Deferred to UI-RFX-02

- Figma two-column Feature Detail parity.
- Project Overview hierarchy changes.
- Context, Repositories and Readiness redesign.
- Board mobile containment and product-wide responsive refinement.
- Broad localization or terminology changes.

## Certification record

Executed on Windows 11 with the repository's existing frontend environment:

- ESLint: PASS.
- TypeScript: PASS.
- Architecture checker: PASS (`125` production files inspected).
- Vitest: PASS (`31` files, `238` tests).
- Vite production build: PASS.
- Chromium behavioral E2E: PASS (`22` passed, `1` skipped).
- E2E isolation: PASS; the pre-existing server was not written to.
- The aggregate `npm run test` reports `40` Node tests passed and one
  pre-existing desktop lockfile assertion failed because the committed
  `desktop/src-tauri/Cargo.lock` uses CRLF while the assertion expects LF.
  This UI-RFX-01 change does not modify that Rust lockfile or test.
- The visual-baseline run was executed without updating snapshots. Four
  Workbench captures differ only in masked fixture regions rendered with the
  current Playwright mask color; approved snapshots were intentionally not
  rewritten. The run also reports the existing mobile Board horizontal scroll
  contract (`scrollWidth` 1046 at 390px), which is documented and deferred.

Visual evidence in this task comes from the real Chromium application and is
retained under the runner's ignored `frontend/test-results` artifacts. No
pixel-perfect claim is made for the unavailable Figma node `1:5`.
