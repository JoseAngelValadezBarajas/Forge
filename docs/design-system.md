# Design system

FND-05 reuses the same shell for Workbench, Run Detail, Handoff Queue and Handoff Review. The inspected Figma references are Workbench Overview `67:3`, Record a New Run `67:170`, Run Detail & Timeline `67:242`, Handoff Queue `68:265`, Handoff Review & Acknowledge `68:342`, Empty Workbench `69:3`, Run Failure & Missing Context `69:61` and Mobile Run Detail `69:172`. Status chips and the reporting-boundary banner use existing semantic tokens; reported, observed and verified states remain visually and textually distinct.

The FND-00 shell follows the supplied Forge Figma Core reference (`04 — Desktop / Core`, `1:5`; Workspace Home `4:32`). The visual language is graphite/copper: quiet dark surfaces, thin borders, restrained semantic color and copper for focus and emphasis.

Tokens live in `frontend/src/styles/tokens.css` as CSS custom properties. They cover backgrounds, surfaces, borders, typography, spacing, radius, accents, semantic states and focus rings. Components consume those variables rather than scattering color literals. `frontend/src/styles/index.css` is the single stylesheet entrypoint; its imports preserve the former cascade order. Shared rules live under `styles/`, shell and Command Palette rules beside their app owners, and capability-specific rules beside their feature. See the [frontend architecture](architecture/frontend.md#css-ownership-and-order) before adding or moving styles.

Typography uses Geist with system fallbacks for UI text and IBM Plex Mono with monospace fallbacks for labels and compact metadata. The app does not depend on an external font service to start locally. UI-RFX-01 exposes these existing stacks as `--font-ui` and `--font-mono` without changing their values.

The Figma reference contains sample data in several screens. FND-02 replaces it with SQLite-backed records, real counts, six manual board columns and explicit empty/loading/error states. Cards do not present manual state or satisfied criteria as verified, CI-passed or release-ready evidence. The inspected FND-02 references are Project Overview `4:158`, Project Board `4:271` and Feature Detail `5:89`.

## UI-RFX-01 shared primitives

The first visual-architecture pass promotes only stable, domain-independent
contracts:

- `shared/ui/MetricCard.tsx` owns the common metric label/value/detail markup.
  Its optional `as="article"` preserves the semantic element used by Delivery.
- `shared/ui/StatusChip.tsx` owns the common status class composition and
  underscore-to-space label normalization. A caller may keep a feature style
  hook or an explicit display label when the surrounding feature owns the
  semantics.

Loading, error and empty states remain local when their contracts or visual
semantics differ. See the [UI component inventory](architecture/ui-component-inventory.md).

FND-04 reuses the same shell, tokens and states for the Repositories inventory and Feature Context section. The connected Figma reader exposed FND-04 metadata for `10 — FND-04 / Repositories & Context` (`57:2`) and `11 — FND-04 / States & Components` (`60:2`), plus rendered design context for Project Repositories (`57:5`), Context Package Preview (`58:165`) and the mobile Context Summary (`60:130`). The implementation follows those available graphite/copper layouts and explicitly records any remaining pixel-level comparison as review work rather than claiming broader visual certification.
