# DESK-02 + UX-01 Project Transfer

## Scope

Fix the desktop route-policy resolver and align Project Import/Export with the inspected Figma frames without changing backend contracts, authentication, or Desktop architecture.

## Verification-first sequence

1. Add Rust route-policy regressions for method-aware matching, static-over-dynamic precedence, and genuine ambiguity; run the focused Rust tests to establish the failure.
2. Implement deterministic route candidate resolution while retaining path/query/method/body limits.
3. Add frontend characterization tests for the three import stages, bounded hierarchical preview, error preservation, and the export review flow; then implement the Figma-aligned panels using existing tokens and transport.
4. Add focused transport error normalization tests and keep safe backend/bridge messages free of request bodies and session data.
5. Run focused backend/frontend/Rust checks, then the complete available certification including E2E/isolation and installed-product/CI evidence. Review the diff before commit and PR delivery.

## Acceptance invariants

- Existing HTTP routes and payloads remain unchanged.
- Route selection is based on method plus path, with static segments preferred over parameters and equal-specificity overlaps rejected.
- Import preview is read-only, bounded, hierarchical, and retained after confirmation failure.
- Export is read-only, API-backed, available for archived projects, and downloads the existing v1 document.
- No new runtime dependencies or FND-07 functionality are introduced.
