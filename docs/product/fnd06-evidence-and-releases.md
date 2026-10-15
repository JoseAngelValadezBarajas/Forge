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

Frozen candidate snapshots created before the Acceptance Criteria snapshot was added remain readable but cannot be backfilled by inference: freshness marks them `STALE`, and G03/G06 fail closed. Review the current planning data and create a new candidate to obtain a complete snapshot.

## Release Gates v1

`forge-release-gates-v1` evaluates G01 scope integrity, G02 pinned Context Package integrity, G03 linked documentary coverage, G04 selected deterministic checks, G05 freshness and G06 manifest completeness. Outcomes are `READY_BY_DEFINED_GATES`, `BLOCKED` or derived `STALE`.

G04 requires a supported `forge-verification-rules-v1` / `forge-verifier-v1` evaluation at rule version `1.0` for every selected input: one V02 per selected Context Package, V04 coverage for every selected Evidence Record, and one V03 per selected Handoff revision. Selected Evidence of type `artifact_reference` or source kind `artifact` also requires V01; V01 is currently `BLOCKED` because this release has no managed artifact bytes, so such a candidate cannot become ready. Every usable evaluation must belong to the candidate Project and Feature scope, refer to the exact selected input, have result `PASS`, and remain current under the same fingerprint calculation used by the verification API. Extra, unrelated, unsupported, failed, blocked or stale evaluations cannot substitute for required coverage. If the candidate has no selected input of a category, that category has no corresponding requirement; G02 independently still requires an intact Context Package for each selected Feature.

G03 is evaluated against the candidate's frozen Acceptance Criteria and frozen active evidence. G05 compares the frozen dependency graph with current data: project identity/name, selected Feature identity and gate-relevant fields, Acceptance Criteria identity/content/state/order/revision timestamp, selected Context Packages, Evidence, Verification Evaluations, Handoff revisions and candidate scope. It excludes unrelated Features and unrelated project data. Changed dependencies make a gate evaluation `STALE`; saved gate records and frozen candidate snapshots remain immutable, and reevaluation creates another history record.

G06 validates the manifest schema, identities, exact scope references, cross-record ownership, fingerprints, supported rule identifiers/versions, gate inputs/results, publication status and provenance/integrity metadata. Its structural validation excludes its own result and the final manifest digest to avoid circular self-validation. The final canonical manifest digest is computed after all six checks have been assembled.

`READY_BY_DEFINED_GATES` therefore proves only that this candidate's explicit scope and frozen criteria/evidence links are coherent, its selected Context Packages have intact canonical fingerprints, every selected package/evidence/handoff has the required current named integrity/traceability check, the recorded gate dependencies still match the frozen candidate, and a complete not-published manifest can be produced. It does not prove that code is correct, that criteria are functionally satisfied, that CI passed, or that a release is published.

## Manifest and fingerprints

`forge-release-manifest-v1` JSON is canonicalized with sorted keys and compact separators (UTF-8 SHA-256); array inputs are sorted by stable identifiers. The saved manifest carries candidate revision, scope, evidence provenance, verification rule/version, gate result, limitations, timestamps, and `publication_status: NOT_PUBLISHED`. Markdown embeds HTML-escaped JSON in a preformatted block so user data cannot terminate Markdown fences or inject markup. Local path-like text is omitted from exported fields and source references are represented by digests where appropriate. Fingerprints identify content separately from record IDs and timestamps.

## Artifact handling and limitations

Artifact import is intentionally not implemented. No endpoint accepts a local path, reads arbitrary files, executes artifacts, unpacks archives, or fetches URLs. V01 is therefore explicitly BLOCKED. To enable byte verification later, Forge needs an explicit bounded streaming upload into managed storage with generated names, SHA-256 over received bytes, duplicate/error cleanup, and backup/restore guidance.

The system does not execute user-configured tests, infer remote CI results, make Git writes, create tags, publish packages, deploy, or communicate with external services. Evidence records are not independently audited and user declarations can be inaccurate.

Chromium evidence is captured by `frontend/e2e/fnd06.spec.ts` in [`frontend/artifacts/fnd06/`](../../frontend/artifacts/fnd06/). The images are browser screenshots of the real API and temporary SQLite-backed application, including empty evidence, registration, overview, inventory/detail, verification, draft/frozen candidates, gates, manifest, stale state and mobile layout.

API routes are under `/api/workspaces/{workspace_id}/projects/{project_id}`: `evidence`, `verifications`, and `release-candidates`; generated OpenAPI describes the request/response schemas. Gate preview is non-persistent; `evaluate`, `freeze` and manifest save are explicit persistence operations.
