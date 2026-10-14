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

Repositories, Git paths, integrations, commits, CI, features, tasks, agents and releases are deliberately absent from this contract.
