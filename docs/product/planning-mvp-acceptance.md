# Planning MVP Product Acceptance

## Scope and baseline

This report covers the Planning MVP only: FND-00, FND-01, FND-02 and FND-03. FND-04 is not implemented or started.

- Repository: `C:\Dev\Forge`
- Baseline: `000ea2079c9e34e4c04d82e618136c48014a65c3`
- Validation branch: `validation/planning-mvp-product-acceptance`
- Main state at validation start: fast-forwarded to the baseline, clean, with PR #5 merged.
- Remote merge: PR #5 was merged into `main`; its final quality, Chromium and CodeQL checks completed successfully.
- Current migrations: `20261013_0001` through `20261013_0004_fnd03_decisions_readiness`.

The supplied Forge Figma file (`r10szKLgiIPVi2NBmbjTpm`) remains the visual reference. This validation reuses the existing graphite/copper shell, tokens and component language; it does not introduce a redesign. The Figma connector confirmed access to the file and the `00 — Product Map` page. The connector did not expose the complete page inventory in this run, so this report does not claim a new page-by-page visual certification against unavailable nodes.

## Environments actually used

- Windows 11 workspace, PowerShell, Python 3.12.10, uv, Node `24.13.0`, npm `11.6.2`.
- Clean dependency commands: `uv sync --locked --dev` and `frontend\npm ci`.
- Fresh SQLite and incremental SQLite databases were created under the OS temporary directory only. Both were removed after migration validation.
- Chromium was run through Playwright with a desktop viewport of `1440x900` and a mobile viewport of `390x844`.
- Because port `8000` was occupied by an unrelated listener, validation used aligned alternate ports `8013` and `5174`. No external process was terminated.
- E2E startup applied migrations and seeded the default workspace in a per-run temporary SQLite database. The personal `.forge` database was not used.

## Clean installation and migrations

The documented installation path completed successfully:

```powershell
uv sync --locked --dev
Push-Location frontend
npm ci
Pop-Location
```

Fresh migration certification applied all revisions from an empty SQLite database. Incremental certification applied through `20261013_0003` and then upgraded to `head`; both paths completed and initialization created a workspace. Alembic was also run against an in-memory SQLite database during final certification.

The documented local startup path remains available through `scripts\start.ps1`; its occupied-port guard refuses unrelated listeners instead of terminating them.

## Functional acceptance

### Journey A — First Run

Accepted in real Chromium with the API and SQLite. A new user could identify the Workspace shell, create a Workspace, create a Project, open Project Overview, return Home, switch Workspace and observe persisted isolated state. Empty Home and Projects states provide a next action without fabricating repositories, commits or delivery evidence.

### Journey B — Feature Planning

Accepted. The journey created an Epic, two Features, Epic association, goal and description, three Tasks, three Acceptance Criteria, reordered Tasks and Criteria, changed Feature state, created a dependency, viewed Board and Inventory, reloaded, and verified persistence.

### Journey C — Preserve Context

Accepted. The journey created and accepted a Decision with context, alternatives, rationale and tradeoffs; opened full historical revision content; created Project and Feature Invariants; inspected applicable rules; acknowledged the shown revisions; edited an Invariant; and observed the new revision requiring acknowledgement.

### Journey D — Readiness

Accepted. The journey observed concrete `NOT READY` blockers, added criteria, resolved a dependency, linked and accepted a Decision, acknowledged Invariants, reached `READY TO START`, saved an evaluation, changed the Feature goal, observed `STALE`, previewed the current context and confirmed the previous saved snapshot remained in history. UI copy continues to distinguish planning readiness from implementation or delivery verification.

### Journey E — Project Lifecycle

Accepted. An archived Project remained readable and previewable. `Evaluate & save` was rejected as read-only with a handled `422`; existing history remained available. Restoring the Project recovered write behavior. Switching to another Workspace navigated to Home before loading project-scoped data, preventing cross-Workspace `404` requests and stale context.

## UX hypotheses and findings

| Hypothesis | Result | Priority | Action |
| --- | --- | --- | --- |
| Command Palette advertises Create Feature/Epic but only opens Projects. | Reproduced in project context. | P1 | Palette now exposes contextual commands that open the correct Feature/Epic form for the active Project. Commands requiring a Project are hidden without project context. |
| Decision history is difficult to inspect beyond titles. | Reproduced. | P2 | History now presents expandable full revision content: context, decision, rationale, alternatives and tradeoffs. |
| Invariant acknowledgement lacks enough review context. | Reproduced. | P2 | Readiness now displays the statement and rationale beside the revision-aware acknowledgement action. |
| Home exposes internal milestone labels. | Reproduced. | P2 | Replaced visible FND milestone labels with user-facing Workspace, Planning and future-milestone language. |
| Loading changes cause loss of context or visual jumps. | No blocking break reproduced in the tested journeys. Existing loading panels and request cancellation preserved. | P3 | Deferred visual polish; not a Planning MVP blocker. |
| Readiness does not distinguish preview, saved snapshot and STALE clearly enough. | Friction reproduced. | P2 | Added explicit `CURRENT PREVIEW` copy and `Saved evaluation snapshots` explanation while retaining immutable history and `STALE` labels. |

One additional P1-level defect was found during the real Workspace isolation journey: changing Workspace while on a project-scoped route requested the old Project under the new Workspace. The app now returns to Home on Workspace change or creation, and a regression covers the behavior.

## Accessibility and responsive acceptance

- Command Palette is a labelled dialog with combobox/listbox semantics, keyboard selection, Escape close and focus restoration.
- Desktop keyboard flow and mobile keyboard flow were exercised in Chromium.
- Focus rings cover buttons, links, inputs, textareas and selects.
- Form labels and error/status regions remain exposed to assistive technology.
- Mobile viewport `390x844` had no horizontal document overflow in the tested Home state.
- The six-column Board remains horizontally scrollable by design at narrow widths; this is scoped to the Board canvas rather than an unexpected page-level overflow.

External user validation has not been performed. No satisfaction score or external-user acceptance is claimed.

## Evidence

The VAL-01 Playwright run writes real Chromium screenshots to the ignored local directory `frontend/test-results/val01/`:

- `first-run.png`
- `workspace-home.png`
- `project-overview.png`
- `board-populated.png`
- `feature-detail.png`
- `decisions.png`
- `invariants.png`
- `readiness-not-ready.png`
- `readiness-ready.png`
- `readiness-stale.png`
- `mobile-home.png`

These are generated from the implemented application and temporary SQLite backend. They are not Figma renders or simulated mockups.

## Technical verification

The final local certification after the focused fixes recorded:

- Ruff: passed.
- mypy: passed for 28 backend source files.
- pytest: 30 passed; two non-blocking dependency deprecation warnings.
- Secret audit: passed across 16 reachable commits, 91 index files and 92 worktree files; no binary or symlink files skipped.
- Alembic: fresh, incremental and in-memory SQLite paths passed.
- ESLint: passed.
- TypeScript: passed.
- Vitest: 12 passed across 2 files.
- Vite build: passed.
- VAL-01 Chromium: 2 passed, including the complete product journey and mobile keyboard/layout check.
- Existing Chromium suite: 6 passed on aligned alternate ports.
- Negative E2E isolation probe: passed; a pre-existing server received no writes.
- Browser console: no unexpected console errors. The archived-project `422` is intentionally asserted as an expected, handled rejection; no unexpected `404` remains.

## Deferred backlog

- External-user validation with participants remains required before claiming market or usability validation.
- Visual polish of loading skeleton stability is deferred as P3.
- Full page-by-page Figma node comparison should be repeated when the design connector exposes the relevant Core, Interaction and Responsive pages in the current session.
- The existing dependency deprecation warnings should be addressed in a separate maintenance change.

## Recommendation

The Planning MVP is functionally acceptable for owner review and can be considered for the next milestone only after reviewing the captured evidence and performing external-user validation. This validation does not authorize or start FND-04.

**Recommendation: `PLANNING_MVP_ACCEPTED_WITH_FOLLOWUPS`**
