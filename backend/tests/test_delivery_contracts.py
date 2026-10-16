from app.application.delivery import DeliveryService, canonical_json, digest, utc_now
from app.main import app


def _operation(
    success_status: str, response_model: str | None, request_model: str | None = None
) -> tuple[tuple[tuple[str, str | None], ...], str | None]:
    responses = tuple(
        sorted(
            (
                (success_status, response_model),
                ("422", "HTTPValidationError"),
            )
        )
    )
    return responses, request_model


def test_delivery_canonical_json_bytes_and_digest_are_frozen() -> None:
    value = {"z": 2, "a": "Revisión con ñandú"}

    assert canonical_json(value) == r'{"a":"Revisi\u00f3n con \u00f1and\u00fa","z":2}'
    assert digest(canonical_json(value)) == (
        "1782bc1c4b8e842d46f52f23eaf47f992f3fd893cb1d400703a7f32578019b4b"
    )
    assert DeliveryService is not None  # The legacy application import remains supported.
    assert utc_now().utcoffset() is not None


def test_delivery_openapi_contract_is_frozen() -> None:
    prefix = "/api/workspaces/{workspace_id}/projects/{project_id}"
    expected: dict[str, dict[str, tuple[tuple[tuple[str, str | None], ...], str | None]]] = {
        "/evidence": {
            "get": _operation("200", "list[EvidenceResponse]"),
            "post": _operation("201", "EvidenceResponse", "EvidenceCreate"),
        },
        "/evidence/{evidence_id}": {"get": _operation("200", "EvidenceResponse")},
        "/evidence/{evidence_id}/invalidate": {"post": _operation("200", "EvidenceResponse")},
        "/verifications/rules": {"get": _operation("200", "list[VerificationRuleResponse]")},
        "/verifications": {"get": _operation("200", "list[VerificationResponse]")},
        "/verifications/preview": {
            "post": _operation("200", "VerificationResponse", "VerificationRequest")
        },
        "/verifications/evaluate": {
            "post": _operation("201", "VerificationResponse", "VerificationRequest")
        },
        "/verifications/{evaluation_id}": {"get": _operation("200", "VerificationResponse")},
        "/release-candidates": {
            "get": _operation("200", "list[CandidateResponse]"),
            "post": _operation("201", "CandidateResponse", "CandidateCreate"),
        },
        "/release-candidates/{candidate_id}": {
            "get": _operation("200", "CandidateResponse"),
            "patch": _operation("200", "CandidateResponse", "CandidateUpdate"),
        },
        "/release-candidates/{candidate_id}/freeze": {
            "post": _operation("200", "CandidateResponse", "CandidateFreezeRequest")
        },
        "/release-candidates/{candidate_id}/revisions": {
            "get": _operation("200", "list[CandidateHistoryResponse]")
        },
        "/release-candidates/{candidate_id}/gates/preview": {
            "post": _operation("200", "GateEvaluationResponse")
        },
        "/release-candidates/{candidate_id}/gates/evaluate": {
            "post": _operation("201", "GateEvaluationResponse")
        },
        "/release-candidates/{candidate_id}/gates": {
            "get": _operation("200", "list[GateEvaluationResponse]")
        },
        "/release-candidates/{candidate_id}/manifest": {
            "get": _operation("200", "ManifestResponse"),
            "post": _operation("201", "ManifestResponse", "ManifestSaveRequest"),
        },
        "/release-candidates/{candidate_id}/manifest/download": {"get": _operation("200", None)},
    }

    actual: dict[str, dict[str, tuple[tuple[tuple[str, str | None], ...], str | None]]] = {}
    for full_path, path_item in app.openapi()["paths"].items():
        if not full_path.startswith(prefix):
            continue
        path = full_path.removeprefix(prefix)
        if not any(part in path for part in ("/evidence", "/verifications", "/release-candidates")):
            continue
        operations: dict[str, tuple[tuple[tuple[str, str | None], ...], str | None]] = {}
        for method, operation in path_item.items():
            if method not in {"get", "post", "patch"}:
                continue
            request_body = operation.get("requestBody")
            body_ref = None
            if isinstance(request_body, dict):
                schema = request_body["content"]["application/json"]["schema"]
                body_ref = schema["$ref"].rsplit("/", maxsplit=1)[-1]
            responses = []
            for status, response in operation["responses"].items():
                content = response.get("content", {}).get("application/json", {}).get("schema")
                if isinstance(content, dict) and "$ref" in content:
                    response_model = content["$ref"].rsplit("/", maxsplit=1)[-1]
                elif (
                    isinstance(content, dict)
                    and isinstance(content.get("items"), dict)
                    and "$ref" in content["items"]
                ):
                    item_model = content["items"]["$ref"].rsplit("/", maxsplit=1)[-1]
                    response_model = f"list[{item_model}]"
                else:
                    response_model = None
                responses.append((status, response_model))
            operations[method] = (tuple(sorted(responses)), body_ref)
        actual[path] = operations

    assert actual == expected
