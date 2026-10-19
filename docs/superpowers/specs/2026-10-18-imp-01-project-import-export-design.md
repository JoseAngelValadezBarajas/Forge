# IMP-01 Full Project JSON Import/Export — Technical Specification

## Goal

Provide a safe, deterministic and transactional way to move a complete Forge planning structure between workspaces through the versioned `forge-project-import-v1` JSON contract.

## Scope and boundaries

The contract contains only project metadata, epics, features, tasks, acceptance criteria and feature dependencies. It does not contain or create Decisions, Invariants, acknowledgements, repository connections, Git observations, context packages, Runs, Handoffs, Evidence, Verifications or Release Candidates. Imported state remains planning data; it is never presented as implementation evidence or executed verification.

Import targets one existing Workspace and always creates one new active Project. Export can read active or archived Projects and never mutates them.

## Contract

The document is a strict object with `extra="forbid"` and this shape:

```json
{
  "schema_version": "forge-project-import-v1",
  "project": {"name": "Example project", "description": "Optional description"},
  "epics": [
    {"ref": "epic:foundation", "title": "Foundation", "description": null, "status": "planning"}
  ],
  "features": [
    {
      "ref": "feature:bootstrap",
      "title": "Bootstrap",
      "description": null,
      "goal": "Make the first slice executable",
      "priority": "high",
      "status": "backlog",
      "epic_ref": "epic:foundation",
      "tasks": [
        {"ref": "task:setup", "title": "Create the project", "description": null, "status": "todo", "position": 0}
      ],
      "acceptance_criteria": [
        {"ref": "criterion:running", "description": "The local app starts", "satisfied": false, "position": 0}
      ]
    }
  ],
  "dependencies": [
    {"blocking_feature_ref": "feature:bootstrap", "blocked_feature_ref": "feature:delivery"}
  ]
}
```

`ref` values are local, case-sensitive identifiers unique across the document. They use the corresponding prefix (`epic:`, `feature:`, `task:`, `criterion:`) followed by 1–64 lowercase letters, numbers, `_` or `-`. Duplicate references, missing references, self-dependencies and dependency cycles are invalid.

Omitted descriptions/goals default to `null`; omitted feature priority/status default to `medium`/`backlog`; omitted task status defaults to `todo`; omitted criterion satisfaction defaults to `false`. Explicit values must be valid Forge domain values. Array order is the declared order when positions are omitted. Positions, when provided, must be non-negative and unique within the containing Feature; import preserves the declared order and uses normalized contiguous positions.

The document is bounded to 8 MiB at the transport boundary, 100 epics, 500 features, 2,000 tasks, 2,000 criteria and 5,000 dependencies. Text fields retain the existing domain maximums. These limits match the desktop JSON request limit and prevent unbounded validation or transaction work.

## Canonical fingerprint

The backend parses and validates the document once, normalizes default values and positions, then serializes the normalized model with UTF-8 JSON, sorted keys, no insignificant whitespace and stable enum values. SHA-256 of that canonical JSON is the import fingerprint.

`POST .../projects/import/preview` is read-only and returns the normalized fingerprint, counts, relationship summary, target workspace and the project name conflict status. `POST .../projects/import` receives an envelope containing the document and `expected_fingerprint`; it re-normalizes the document and rejects a mismatch with HTTP 409 before any write. The frontend must send the exact document represented by the preview.

## Application service and transaction

`ProjectTransferService` owns preview, export and import use cases. It uses workspace-scoped repositories and transaction-aware model construction; it does not call committing `PlanningService` methods in a loop. Preview performs only reads and validation. Import validates all references before opening the write transaction, creates the Project and all children with generated Forge UUIDs, flushes to exercise foreign keys and uniqueness, and commits once. Any exception rolls back the complete transaction.

The existing case-insensitive Project name unique index is the persistent duplicate guard. A repeated import with the same project name returns the existing conflict rather than creating a second Project. Concurrent imports rely on the database constraint and translate the losing `IntegrityError` to HTTP 409. The workspace path is resolved before any child lookup, so foreign workspace IDs cannot be used to import or export data.

## API

The planning router exposes:

- `POST /api/workspaces/{workspace_id}/projects/import/preview` → `ProjectImportPreviewResponse`.
- `POST /api/workspaces/{workspace_id}/projects/import` → `ProjectImportResponse` with generated Project/Epic/Feature/Task/Criterion/Dependency IDs and local-reference mappings.
- `GET /api/workspaces/{workspace_id}/projects/{project_id}/export` → deterministic JSON attachment named `forge-project-<project_id>-import-v1.json`.

The import endpoints use application errors already mapped to stable 404/409/422 responses. The export endpoint permits archived Projects and returns only the supported snapshot. The route is added to the generated Tauri manifest; the existing Rust bridge enforces its 8 MiB request limit and does not gain filesystem access.

## Frontend

Projects receives an Import Project panel with file selection and JSON paste inputs. Preview is mandatory before confirmation; validation and relationship errors are shown in the panel, and the confirm action is disabled until a current fingerprint exists. Confirmation shows a pending state, then navigates to the generated Project. The panel never writes partial data.

Project Overview receives an Export Project action using the existing authenticated download transport. It remains available for archived Projects and is labeled as a planning snapshot, not evidence.

## Verification

Backend tests cover strict schema failures, bounds, reference resolution, cycles, cross-workspace isolation, archived export, duplicate names, concurrent conflict, injected mid-transaction failure and full rollback, preview read-only behavior, fingerprint mismatch, and export/import round-trip.

Frontend tests cover API request contracts, preview/confirm/error states and export availability. Chromium runs the real FastAPI server with temporary SQLite through upload, preview, invalid input, confirmation, relationship verification, export and duplicate rejection. Fresh/incremental Alembic, route/OpenAPI contracts, architecture checks, secret audit, frontend quality, Desktop route policy, CodeQL and Windows installed-product smoke remain required gates.

