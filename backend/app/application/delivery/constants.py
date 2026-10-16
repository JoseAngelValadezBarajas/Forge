"""Versioned identifiers and supported Delivery declaration types."""

VERIFICATION_RULESET = "forge-verification-rules-v1"

RELEASE_RULESET = "forge-release-gates-v1"

MANIFEST_SCHEMA = "forge-release-manifest-v1"

CANDIDATE_SCHEMA = "forge-release-candidate-v1"

VERIFIER_VERSION = "forge-verifier-v1"

EVIDENCE_TYPES = {
    "reported_test_result",
    "document_reference",
    "artifact_reference",
    "git_observation_reference",
    "context_snapshot_reference",
    "handoff_revision_reference",
    "manual_attestation",
}

SOURCE_KINDS = {
    "safe_link",
    "artifact",
    "commit",
    "context_package",
    "git_observation",
    "handoff_revision",
    "manual",
}
