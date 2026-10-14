# API contracts

All routes are local under `/api`. JSON timestamps are UTC ISO-8601 values.

## Workspaces

- `GET /api/workspaces` lists workspaces.
- `POST /api/workspaces` accepts `{ "name": string, "description"?: string }` and returns `201`.
- `GET /api/workspaces/{workspace_id}` returns one workspace.
- `PATCH /api/workspaces/{workspace_id}` updates supplied `name` and/or `description` fields.

Workspace names are required and duplicate names are rejected with `409` using a case-insensitive comparison.

## Projects

- `GET /api/workspaces/{workspace_id}/projects?search=&status=active|archived|all` lists only that workspace's projects.
- `POST /api/workspaces/{workspace_id}/projects` accepts `{ "name": string, "description"?: string }` and returns `201`.
- `GET /api/workspaces/{workspace_id}/projects/{project_id}` returns a project only when it belongs to the supplied workspace.
- `PATCH /api/workspaces/{workspace_id}/projects/{project_id}` updates supplied fields.
- `POST /api/workspaces/{workspace_id}/projects/{project_id}/archive` archives a project.
- `POST /api/workspaces/{workspace_id}/projects/{project_id}/restore` restores it.

Project names are required and unique case-insensitively within a workspace. Archive is reversible; there is no delete endpoint in FND-01. `404` indicates a missing workspace or a project outside the requested workspace, `409` indicates a duplicate name, and validation failures return `422`.

## Planning

Planning routes are nested under a workspace and project, which is the isolation boundary:

- `GET /api/workspaces/{workspace_id}/projects/{project_id}/planning/overview` returns real SQLite counts for epics, features, tasks, criteria and dependencies.
- `GET|POST /api/workspaces/{workspace_id}/projects/{project_id}/epics` lists or creates epics. `GET|PATCH .../epics/{epic_id}` reads or edits one epic.
- `GET|POST /api/workspaces/{workspace_id}/projects/{project_id}/features` lists or creates features. Filters are `search`, `status`, `priority` and `epic_id`. `GET|PATCH .../features/{feature_id}` reads or edits one feature.
- `GET|POST .../features/{feature_id}/tasks` lists or creates tasks; `PATCH .../tasks/{task_id}` edits one task; `POST .../tasks/reorder` accepts `{ "ids": string[] }`.
- `GET|POST .../features/{feature_id}/acceptance-criteria` lists or creates criteria; `PATCH .../acceptance-criteria/{criterion_id}` edits one criterion.
- `GET|POST /api/workspaces/{workspace_id}/projects/{project_id}/dependencies` lists or creates dependencies; `DELETE .../dependencies/{dependency_id}` removes one.

Feature IDs are stable, UUID-backed and readable per project (`FEAT-001`). Manual feature states are `backlog`, `refining`, `ready`, `in_progress`, `verify` and `done`. Dependency creation rejects self-links, duplicates, missing or cross-project features, and direct/transitive cycles. Mutations below an archived project return `422`; reads remain available.

## Decisions, invariants and readiness

- `GET|POST .../projects/{project_id}/decisions` lists or creates project decisions; `GET|PATCH .../decisions/{decision_id}` reads or edits one; `POST .../decisions/{decision_id}/accept` accepts it; `POST .../decisions/{decision_id}/supersede` creates and links a successor; `GET .../decisions/{decision_id}/revisions` returns immutable history. Editing accepted decision content creates a new proposed revision that must be accepted again; superseded decisions remain historical and cannot be edited.
- `POST|DELETE .../decisions/{decision_id}/features/{feature_id}` links or unlinks a decision from a Feature; `GET .../features/{feature_id}/decisions` returns linked decisions.
- `GET|POST .../projects/{project_id}/invariants` lists or creates project/Feature-scoped invariants; `GET|PATCH .../invariants/{invariant_id}` reads or edits one; `POST .../invariants/{invariant_id}/retire` retires it; `GET .../invariants/{invariant_id}/revisions` returns immutable history.
- `GET .../features/{feature_id}/invariants` returns active applicable invariants with acknowledgement state; `POST .../features/{feature_id}/invariants/{invariant_id}/acknowledge` accepts `{ "expected_revision": number }` and records acknowledgement only when that revision is still current. A changed revision returns `409` and does not acknowledge the later content.
- `POST .../features/{feature_id}/readiness/preview` evaluates R01-R06 without creating history. `GET .../features/{feature_id}/readiness/evaluations` lists saved snapshots. `POST .../features/{feature_id}/readiness/evaluations` evaluates and saves one immutable snapshot.

Readiness outcomes are `READY_TO_START` or `NOT_READY`. R01 requires title and goal; R02 requires at least one described acceptance criterion but ignores its satisfied flag; R03 checks blocking Feature states; R04 checks linked decision acceptance including supersession; R05 checks current-revision invariant acknowledgement; and R06 rejects archived projects. An evaluation is stale when its saved fingerprint no longer matches the current normalized planning inputs. Preview remains available for archived projects, while saving a new evaluation is rejected with `422`; existing snapshots remain readable. The engine reports planning state only and never claims repository, CI, agent or delivery evidence.

## Optional repositories and Context Packages

- `GET|POST /api/workspaces/{workspace_id}/projects/{project_id}/repositories` lists or connects an absolute local Git working tree. Connection validates the repository without reading source content. Connections are project-scoped and duplicate roots return `409`.
- `POST .../repositories/{repository_id}/observe` records one immutable, metadata-only Git observation. `GET .../repositories/{repository_id}/observations` reads its history. `POST .../repositories/{repository_id}/disconnect` marks a connection disconnected without deleting observations or packages.
- `GET|POST .../features/{feature_id}/repositories` lists or links a repository to a Feature; `DELETE .../features/{feature_id}/repositories/{repository_id}` unlinks it. Cross-project links return `404`.
- `POST .../features/{feature_id}/context/preview` builds a package without saving it. `GET|POST .../features/{feature_id}/context/packages` lists or immutably saves a `forge-context-v1` package. An identical Feature/schema/fingerprint is deduplicated. `GET .../context/packages/{package_id}` reads one snapshot and `/download?format=json|markdown` exports it.

Packages contain normalized product planning and selected Git state. They do not contain local filesystem paths, remote URLs, credentials, author identities, commit messages, diffs, source content or untracked file names. Archived projects keep repository/package reads and preview available, but connection, observation, link and save mutations return `422`. Git operations are read-only and local; Forge does not fetch, push, commit, checkout, merge or reset.

A satisfied acceptance criterion is not evidence of verification.

## Agent runs and handoffs

- `GET /api/workspaces/{workspace_id}/runs` lists runs with optional `project_id`, `feature_id`, `status` and `search` filters.
- `GET|POST /api/workspaces/{workspace_id}/projects/{project_id}/runs` lists or records a run. Creation requires a same-Feature immutable Context Package, fixes `execution_mode` to `manual`, and accepts `executor_type` as `human`, `external_agent` or `unknown` only as a reported label.
- `GET .../runs/{run_id}` reads a pinned run; `POST .../runs/{run_id}/status` performs an allowed transition with `{ "expected_version": number }`.
- `GET|POST .../runs/{run_id}/events` reads or appends a manual event with an expected run version. Corrections link `supersedes_event_id`; events are never edited or deleted.
- `GET|POST .../runs/{run_id}/outputs` reads or records structured output references. Arbitrary filesystem paths, source content and transcripts are rejected.
- `GET /api/workspaces/{workspace_id}/projects/{project_id}/handoffs` lists handoffs. `POST .../runs/{run_id}/handoffs` creates a draft; `GET|PATCH .../handoffs/{handoff_id}` reads or edits a draft with an expected version.
- `POST .../handoffs/{handoff_id}/ready` publishes an immutable `forge-handoff-v1` revision. `POST .../revise` creates a new draft from an acknowledged revision. `POST .../acknowledge` requires `{ "expected_revision": number, "acknowledged_by": string }` and returns `409` if the displayed revision is stale. `POST .../withdraw` prevents later acknowledgement.
- `GET .../handoffs/{handoff_id}/revisions` lists immutable history; `/revisions/{revision}/download?format=json|markdown` exports one exact revision.

Archived projects remain readable, but all new FND-05 writes are rejected until the project is restored. A run or handoff is a human-reported record and never implies agent execution, CI, verification or delivery evidence.
