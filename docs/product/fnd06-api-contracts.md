# FND-06 API contracts

Base path: `/api/workspaces/{workspace_id}/projects/{project_id}`.

| Resource | Operations |
| --- | --- |
| `evidence` | `GET`, `POST`; `GET /{id}`; `POST /{id}/invalidate` |
| `verifications` | `GET`, `GET /rules`; `POST /preview`, `POST /evaluate`; `GET /{id}` |
| `release-candidates` | `GET`, `POST`; `GET/PATCH /{id}`; `POST /{id}/freeze`; `GET /{id}/revisions` |
| Gates | `POST /{id}/gates/preview`, `POST /{id}/gates/evaluate`, `GET /{id}/gates` |
| Manifest | `GET/POST /{id}/manifest`; `GET /{id}/manifest/download?format=json|markdown` |

Preview endpoints do not persist. Evaluations, freeze, and manifest save do. Candidate updates require `expected_revision`; freeze requires the current draft revision. Internal source references must resolve within the same project and selected feature. Archived projects are read-only for persistence operations. Validation errors use FastAPI 422 for invalid request shape and 400 for domain-level invalid inputs; absent resources return 404 and revision conflicts return 409. Error payloads do not include SQL details.
