# Implementation Plan: UI-RFX-01 Design System & Visual Architecture

## Goal

Establish a small, evidence-based shared visual vocabulary without changing
routes, API transport, feature behavior, CSS cascade order, or the Figma visual
direction.

## Global constraints

- Preserve all existing HTTP contracts, routes, Tauri transport behavior and
  feature ownership.
- Keep the graphite/copper token values and the stylesheet import order unless
  a concrete regression requires otherwise.
- Shared UI may not import app or feature modules; features consume shared UI.
- Do not add dependencies, redesign screens, or move feature pages.
- Every new or changed component contract gets focused Vitest coverage.
- Document components that remain feature-local when their markup or semantics
  are not interchangeable.

## Tasks

### Task 1: Add shared visual primitives with tests first

Add `shared/ui/MetricCard.tsx` and `shared/ui/StatusChip.tsx` with the smallest
contracts that preserve existing DOM semantics, labels, status formatting and
class hooks. Add focused tests that fail before implementation, then implement
the primitives.

### Task 2: Migrate proven duplicate consumers

Replace the duplicate project, workbench and delivery metric implementations
with `MetricCard`. Replace the workbench and delivery status wrappers with
`StatusChip` where the rendered contract is equivalent. Remove only obsolete
local implementations and preserve feature-specific CSS class hooks.

### Task 3: Align token usage and document ownership

Add typography aliases to the existing token source without changing rendered
values, use them in shared status/section typography, and update the design
system documentation. Create `docs/architecture/ui-component-inventory.md`
and `docs/product/ui-rfx-01.md` with the actual current inventory, Figma
inspection notes, migration decisions, deferred UI-RFX-02 scope and known
language/visual limitations.

### Task 4: Certify and deliver

Run focused tests followed by lint, typecheck, architecture checks, build,
Vitest, E2E and isolation. Capture representative Chromium evidence on the
existing test infrastructure where available, review the complete diff, commit
the focused work, push the branch and create one Draft PR targeting `main`.
