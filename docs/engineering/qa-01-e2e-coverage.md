# QA-01 E2E coverage matrix

This matrix records browser acceptance coverage that runs against the isolated FastAPI and temporary SQLite runner. It is not a statement that Forge executes agents, CI systems, deployments, or external Git actions.

| User journey | Existing coverage | QA-01 coverage | Important boundary |
| --- | --- | --- | --- |
| First run, theme and health | `smoke.spec.ts` | — | Empty workspace is real SQLite state; no console errors. |
| Workspace/project lifecycle and isolation | `smoke.spec.ts`, `val01.spec.ts` | `qa01-acceptance.spec.ts` | Archive preserves reads; writes are rejected until restore. |
| Epics, Features, Tasks, criteria, dependencies and Board | `planning.spec.ts`, `val01.spec.ts` | `qa01-acceptance.spec.ts` | Feature search and priority filters show both matching and true empty results. |
| Decisions, invariants and readiness freshness | `fnd03.spec.ts`, `val01.spec.ts` | — | Saved readiness is a planning snapshot, never implementation evidence. |
| Local repositories and Context Packages | `fnd04.spec.ts`, `visual-baseline.spec.ts` | `qa01-acceptance.spec.ts` | A path outside configured temporary roots returns 422 and creates no connection. |
| Runs and Handoffs | `fnd05.spec.ts` | — | Runs are declared records; published revisions and acknowledgements are explicit. |
| Evidence, verifications and release candidates | `fnd06.spec.ts`, `visual-baseline.spec.ts` | — | Gates remain blocked when required inputs are absent or stale; manifests are `NOT_PUBLISHED`. |
| Command Palette, focus, responsive layout and themes | `accessibility.spec.ts`, `visual-baseline.spec.ts`, `val01.spec.ts` | — | Existing desktop/mobile baselines stay unchanged. |
| E2E process/database isolation | `isolation-probe.spec.ts`, runner tests | — | Runner refuses occupied ports, owns a temporary database, and cleans only invocation resources. |

## Deliberate scope

QA-01 adds coverage where the existing suite did not connect a user-visible lifecycle or negative behavior to a real backend assertion. It does not duplicate unit-level stale-response tests, API contract tests, or the installed Tauri application smoke. The latter continues to use native Windows UI Automation without CDP or WebView remote debugging.

## Residual acceptance limits

- The Windows installed-product flow proves the packaged UI on the reported Windows runner; it is not a replacement for external-user research or a Windows 11-specific field qualification.
- Git observation coverage uses purpose-created local repositories and proves read-only behavior. It does not contact remotes or assert any hosted Git provider behavior.
- Browser acceptance verifies Forge records declared work and evidence. It does not assert that an external agent, test runner, CI system, deployment, or release actually ran.
