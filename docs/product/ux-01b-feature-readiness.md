# UX-01B · Feature Workflow & Readiness

UX-01B improves the existing Feature Detail workflow without changing the
readiness engine or its API contracts.

## Feature workflow

Feature Detail now exposes a compact planning summary with the backend
readiness outcome, manual status and priority, Epic, criteria count and
blocking-dependency count. Section navigation anchors Definition, Tasks,
Acceptance criteria, Dependencies and Readiness. Existing forms, validation,
reordering and error recovery remain backed by the existing API.

## Readiness actions and truth model

The Readiness panel renders the backend's R01–R06 results, blocker messages,
references and rule-set version. Failed rules offer only contextual navigation
that already exists in Forge:

- R01 → feature definition.
- R02 → acceptance criteria.
- R03 → the referenced blocking Feature or Dependencies.
- R04 → Decisions.
- R05 → applicable invariants in the Readiness panel.
- R06 → Project Overview, where an archived Project can be restored.

Unknown rule IDs and references remain visible without generating speculative
actions. `READY TO START` means the planning rules pass; it is not evidence of
implementation, testing, compliance or release approval. R02 does not require
criteria to be manually marked satisfied.

The panel distinguishes the current read-only preview from saved evaluation
snapshots. Saved snapshots remain immutable; a snapshot whose fingerprint no
longer matches the current planning context is labelled `STALE`.

## Archived Projects

Archived Projects remain readable, including Feature Detail, criteria,
dependencies, readiness and saved history. Feature editing, task and criterion
creation/editing/reordering, dependency changes, decision linking, invariant
acknowledgement and `Evaluate & save` are not exposed. `Preview current` is
retained because it is read-only. Backend authorization remains the final
enforcement boundary.

## Visual reference and verification

Implementation was aligned with the graphite/copper language and structure of
Figma file `r10szKLgiIPVi2NBmbjTpm`, Feature Detail frame `5:89` and Project
Overview frame `4:158`. Real Chromium captures are produced by
`frontend/e2e/ux01b-feature-readiness.spec.ts` under the Playwright
`test-results` directory; they are not committed as product assets.

Focused checks:

```text
npx vitest run src/features/readiness/ReadinessPanel.test.tsx src/features/planning/planning.test.tsx
npm run lint
npm run typecheck
npm run build
npm run e2e -- --grep "guides a feature"
```
