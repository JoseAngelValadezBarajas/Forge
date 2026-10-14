# FND-06 · Evidence, Verification & Release Candidates

FND-06 records evidence declarations, runs a small versioned set of deterministic checks, and freezes release-candidate snapshots. It does not publish or deploy software.

## Trust and provenance

Evidence `provenance` describes how a record entered Forge: user declarations remain `REPORTED`; saved Forge observations such as Context Packages, Git observations and immutable Handoff revisions are `OBSERVED`. `VERIFIED` belongs to the output of a named check, not a user-editable evidence field. `UNKNOWN` is reserved for unavailable provenance. Evidence is retained as `ACTIVE`, `INVALIDATED` or `SUPERSEDED`; invalidation is non-destructive. A `PASS` means only that the specified rule passed on its listed inputs.

## Verification Rules v1

Rules are versioned under `forge-verification-rules-v1`; implementations identify themselves as `forge-verifier-v1`.

| Rule | Result scope | Limitation |
| --- | --- | --- |
| V01 Artifact Integrity | `BLOCKED` in this release | Forge does not yet manage imported artifact bytes; references are never fetched or opened. |
| V02 Context Package Integrity | Recomputed canonical payload SHA-256 versus stored and optional expected digest | Snapshot integrity only; not implementation or planning correctness. |
| V03 Handoff Revision Integrity | Canonical payload digest plus schema, IDs and revision consistency | Acknowledgement is not execution evidence. |
| V04 Evidence Traceability | Project, Feature, criterion, status and link structure | Does not establish truth of declarations or functional acceptance. |

Evaluations are immutable records. Current staleness is derived by rerunning the same rule over its references and comparing input fingerprints. Missing/unsupported inputs do not pass.

## Release Candidate lifecycle

Candidates begin as editable `DRAFT` revisions with optimistic revision checks. Freezing captures selected Features, Context Packages, evidence, verification outcomes and Handoff revisions; subsequent changes require a new candidate. Historical snapshots and gate evaluations are preserved. Projects in archived state remain readable but cannot receive new evidence, saved evaluations, freezes, gates or manifests.

## Release Gates v1

`forge-release-gates-v1` evaluates G01 scope integrity, G02 pinned Context Package integrity, G03 linked documentary coverage, G04 selected deterministic checks, G05 freshness and G06 manifest completeness. Outcomes are `READY_BY_DEFINED_GATES`, `BLOCKED` or derived `STALE`. Even READY means only that these named conditions passed. It does not mean code is correct, CI passed, or a release is published.

## Manifest and fingerprints

`forge-release-manifest-v1` JSON is canonicalized with sorted keys and compact separators (UTF-8 SHA-256); array inputs are sorted by stable identifiers. The saved manifest carries candidate revision, scope, evidence provenance, verification rule/version, gate result, limitations, timestamps, and `publication_status: NOT_PUBLISHED`. Markdown embeds HTML-escaped JSON in a preformatted block so user data cannot terminate Markdown fences or inject markup. Local path-like text is omitted from exported fields and source references are represented by digests where appropriate. Fingerprints identify content separately from record IDs and timestamps.

## Artifact handling and limitations

Artifact import is intentionally not implemented. No endpoint accepts a local path, reads arbitrary files, executes artifacts, unpacks archives, or fetches URLs. V01 is therefore explicitly BLOCKED. To enable byte verification later, Forge needs an explicit bounded streaming upload into managed storage with generated names, SHA-256 over received bytes, duplicate/error cleanup, and backup/restore guidance.

The system does not execute user-configured tests, infer remote CI results, make Git writes, create tags, publish packages, deploy, or communicate with external services. Evidence records are not independently audited and user declarations can be inaccurate.

Chromium evidence is captured by `frontend/e2e/fnd06.spec.ts` in [`frontend/artifacts/fnd06/`](../../frontend/artifacts/fnd06/). The images are browser screenshots of the real API and temporary SQLite-backed application, including empty evidence, registration, overview, inventory/detail, verification, draft/frozen candidates, gates, manifest, stale state and mobile layout.

API routes are under `/api/workspaces/{workspace_id}/projects/{project_id}`: `evidence`, `verifications`, and `release-candidates`; generated OpenAPI describes the request/response schemas. Gate preview is non-persistent; `evaluate`, `freeze` and manifest save are explicit persistence operations.
