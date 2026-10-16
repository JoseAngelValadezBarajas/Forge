# API Contract Integrity · RFX-ORG-03A

## Baseline and method

The original references remain unchanged: `frontend/tests/fixtures/rfx02d-api-response-baseline.json` and `backend/tests/fixtures/rfx01b-openapi-baseline.json`. The checker generates OpenAPI from the running FastAPI application with a temporary, isolated SQLite URL, resolves frontend types with the pinned TypeScript compiler API, and checks every characterized `forgeApi` operation. The backend frozen-schema test applies only the response-schema corrections listed in `backend/tests/fixtures/rfx-org-03a-openapi-delta.json`; it still compares the complete result to the historical fixture. The route registry remains unchanged.

The baseline verifier reported 19 top-level response-shape discrepancies across 94 operations. Evidence for classification came from Pydantic schemas, OpenAPI, route response declarations, serialization helpers, and real API response tests using temporary SQLite.

## Disposition of the 19 baseline discrepancies

| Operation | Endpoint | Backend response / frontend DTO | Discrepant field(s) | Classification and correction |
|---|---|---|---|---|
| `listDecisionRevisions` | `GET /decisions/{decision_id}/revisions` | `DecisionRevisionResponse[]` / `DecisionRevision[]` | `project_id`, `updated_at` were inherited but absent from immutable revisions | Frontend typing defect; declare the revision DTO explicitly. |
| `listVerificationRules` | `GET /verifications/rules` | No concrete response model / `VerificationRule[]` | `rule_id`, `version`, `title`, `available`, `required_inputs`, `limitation` | Backend schema defect; add the exact `VerificationRuleResponse` model. Runtime catalog values are unchanged. |
| `listVerifications` | `GET /verifications` | `VerificationResponse[]` / `VerificationEvaluation[]` | `id`, `feature_id`, `evaluated_at`, `stale` | Backend requiredness defect: defaults made always-emitted keys optional in OpenAPI. Declare the keys required and preserve nullable values. |
| `previewVerification` | `POST /verifications/preview` | `VerificationResponse` / `VerificationEvaluation` | `id`, `feature_id`, `evaluated_at`, `stale` | Same requiredness defect. The route now explicitly supplies its project and feature identifiers. |
| `evaluateVerification` | `POST /verifications/evaluate` | `VerificationResponse` / `VerificationEvaluation` | `id`, `feature_id`, `evaluated_at`, `stale` | Same requiredness defect; persisted serialization already emits these keys. |
| `previewReleaseGates` | `POST /release-candidates/{candidate_id}/gates/preview` | `GateEvaluationResponse` / `GateEvaluation` | `id`, `evaluated_at`, `stale` | Backend requiredness defect. Also corrected DTO nullability for preview fields that serialize as `null`. |
| `evaluateReleaseGates` | `POST /release-candidates/{candidate_id}/gates/evaluate` | `GateEvaluationResponse` / `GateEvaluation` | `id`, `evaluated_at`, `stale` | Backend requiredness defect; saved evaluations already serialize the keys. |
| `listReleaseGateHistory` | `GET /release-candidates/{candidate_id}/gates` | `GateEvaluationResponse[]` / `GateEvaluation[]` | `id`, `evaluated_at`, `stale` | Backend requiredness defect; history serialization already emits the keys. |
| `listInvariantRevisions` | `GET /invariants/{invariant_id}/revisions` | `InvariantRevisionResponse[]` / `InvariantRevision[]` | `project_id`, `updated_at` were inherited but absent from immutable revisions | Frontend typing defect; declare the actual revision fields explicitly. |
| `previewReadiness` | `POST /features/{feature_id}/readiness/preview` | `ReadinessEvaluationResponse` / `ReadinessEvaluation` | `stale` | Backend requiredness defect: the route always supplies this value. |
| `saveReadiness` | `POST /features/{feature_id}/readiness/evaluations` | `ReadinessEvaluationResponse` / `ReadinessEvaluation` | `stale` | Backend requiredness defect; stored evaluation response always computes the value. |
| `listReadinessEvaluations` | `GET /features/{feature_id}/readiness/evaluations` | `ReadinessEvaluationResponse[]` / `ReadinessEvaluation[]` | `stale` | Backend requiredness defect; history responses always include it. |
| `listHandoffs` | `GET /handoffs` | `HandoffResponse[]` / `Handoff[]` | `published_revision`, `acknowledgement`, `acknowledgements` | Backend schema defect: `_handoff_response` always supplies all three, including `null`/empty values. |
| `getHandoff` | `GET /handoffs/{handoff_id}` | `HandoffResponse` / `Handoff` | Same three fields | Same backend schema defect; no serialization change. |
| `createHandoff` | `POST /runs/{run_id}/handoffs` | `HandoffResponse` / `Handoff` | Same three fields | Same backend schema defect; actual responses include `null`, `null`, and `[]` for a draft. |
| `updateHandoff` | `PATCH /handoffs/{handoff_id}` | `HandoffResponse` / `Handoff` | Same three fields | Same backend schema defect; `_handoff_response` explicitly fills them. |
| `readyHandoff` | `POST /handoffs/{handoff_id}/ready` | `HandoffResponse` / `Handoff` | Same three fields | Same backend schema defect; current acknowledgement remains explicitly nullable. |
| `reviseHandoff` | `POST /handoffs/{handoff_id}/revise` | `HandoffResponse` / `Handoff` | Same three fields | Same backend schema defect; historical acknowledgement list remains present. |
| `withdrawHandoff` | `POST /handoffs/{handoff_id}/withdraw` | `HandoffResponse` / `Handoff` | Same three fields | Same backend schema defect; response serialization is unchanged. |

## Additional structural defects found and fixed

- `VerificationResponse.project_id` is always a non-null project path value. Its OpenAPI schema and frontend DTO now say required string. `rule_id` now has the same four literal values as request/catalog semantics.
- Readiness nested arrays (`ReadinessBlocker.references`, `ReadinessRuleResult.blockers` and `.references`) are always emitted. Their schemas are required; the response adapter materializes prior defaults before validation. `ReadinessReference.label` is emitted as nullable, so the frontend now models `string | null` as a required field. Existing serialized values are preserved.
- `CandidateResponse.selection` is a stable five-list object, not an arbitrary dictionary. Its Pydantic response model now documents those arrays and validates the actual stored selection shape.
- Request DTOs now constrain evidence kinds, verification rule IDs, run event types and output reference kinds to backend-supported values. `updateInvariant` no longer types or sends the create-only `feature_id` field; the update route ignores it, so removing that extraneous key does not change the update result.

## Verification boundaries

The verifier checks route/method identity, unambiguous path-template matching, characterized query keys, query value types, JSON request body assignability, all successful response status/body schemas, nested object and array types, requiredness, nullability, enums/literal unions, references, and OpenAPI compositions. Unsupported TypeScript types and unresolved OpenAPI references fail explicitly. TypeScript `number` maps to JSON numeric representation; JavaScript/TypeScript cannot distinguish integer values at the type level, so backend integer validation remains authoritative. String formats and numeric bounds remain runtime constraints rather than TypeScript structural types.

Negative unit fixtures independently cover missing required fields, optionality, nullability, nested scalar drift, array element drift, enum drift, unresolved references, invalid successful status/body combinations, request-body drift, and optional request properties where the backend requires them. They also exercise alias resolution, `allOf`/`oneOf`/`anyOf`, nullable unions, recursive references, and route-template matching.

No SQLAlchemy models, migrations, route paths/methods, handoff serialization, fingerprints, verification outcomes, release snapshots, or delivery provenance semantics were changed.
