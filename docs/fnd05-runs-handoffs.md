# FND-05 · Agent Runs and Handoffs

FND-05 records reported work without executing agents, reading conversations or claiming delivery evidence. Every run is scoped to one Project and Feature and pins one immutable `forge-context-v1` Context Package from that Feature. `execution_mode` is currently `manual`; `executor_type` describes the reporting actor (`human`, `external_agent` or `unknown`) and does not imply that an external agent was executed or connected.

## Run lifecycle

Runs use explicit states:

`PLANNED → IN_PROGRESS → AWAITING_HANDOFF → COMPLETED | FAILED | CANCELLED`

`PLANNED` may also be cancelled. `IN_PROGRESS` may complete, fail or cancel. `AWAITING_HANDOFF` may complete, fail or cancel. Terminal states cannot transition again. Updates require the current `version`; a stale version returns `409` and no write is made.

Run events are append-only. They use an explicit type (`progress`, `blocker`, `decision_note`, `output_reported`, `status_changed`, `correction` or `general_note`), record origin as `manual`, and distinguish Forge recording time from an optional reported occurrence time. Corrections reference the event they supersede; original events remain unchanged.

Outputs are structured references with a summary and provenance. FND-05 does not accept arbitrary filesystem paths, transcripts, source content or provider telemetry.

## Handoff lifecycle

Handoffs are created from a run as `DRAFT`. Draft fields may be edited using optimistic version checks. Marking a draft `READY` creates an immutable revision with a deterministic `forge-handoff-v1` JSON payload, Markdown rendering and SHA-256 fingerprint. A correction after acknowledgement creates a new draft; it never edits a published revision.

Acknowledgement requires the exact published `revision` displayed to the reviewer. The server rejects stale revisions with `409`, rejects withdrawn handoffs, and does not acknowledge a revision the reviewer did not explicitly inspect. Acknowledgement means review responsibility only; it does not certify implementation, testing, CI or delivery correctness.

Published revisions can be listed and downloaded as JSON or Markdown. Markdown escapes unsafe content before rendering inside the exported code block.

## API surface

The routes are nested under `/api/workspaces/{workspace_id}`:

- `/runs` lists runs; `/projects/{project_id}/runs` creates and lists project runs.
- `/projects/{project_id}/runs/{run_id}` reads a run, transitions status, appends events and records structured outputs.
- `/projects/{project_id}/runs/{run_id}/handoffs` creates a draft handoff.
- `/projects/{project_id}/handoffs` lists, reads and updates handoffs, publishes revisions, acknowledges or withdraws them, and downloads immutable revisions.

Archived Projects remain readable for existing runs, events, outputs, handoffs and revisions. New run, event, output, handoff, publish, acknowledge and withdrawal writes are rejected while archived. Restoring the Project re-enables those writes.

## Frontend boundary

Workbench is backed only by these API records and honest empty states. It shows pinned context fingerprints, append-only timelines, handoff status and reporting-boundary notices. It never starts an agent, reads a local process, inspects a conversation or renders fabricated commits, CI, verification or release evidence. Requests are cancellable so an older workspace, project or search response cannot overwrite the current view.

The implementation follows the Workbench, Run Detail, Handoff Queue, Handoff Review and Empty/Failure states in the supplied Forge Figma file (`r10szKLgiIPVi2NBmbjTpm`, nodes `67:3`, `67:170`, `67:242`, `68:265`, `68:342`, `69:3` and `69:61`). It reuses the graphite/copper token system and responsive shell already present in the application.

## Verification

The FND-05 migration is `20261014_0006_fnd05_runs_handoffs`. The backend regression suite covers isolation, state transitions, optimistic conflicts, append-only corrections, immutable revisions, stale acknowledgements, archived-project boundaries and Markdown escaping. Frontend tests cover empty Workbench state, out-of-order search responses, current-version event writes and visible-revision acknowledgement. Playwright runs the real API and a temporary SQLite database, including screenshots under `frontend/test-results/`.
