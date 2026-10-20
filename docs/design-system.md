# Design system

FND-05 reuses the same shell for Workbench, Run Detail, Handoff Queue and Handoff Review. The inspected Figma references are Workbench Overview `67:3`, Record a New Run `67:170`, Run Detail & Timeline `67:242`, Handoff Queue `68:265`, Handoff Review & Acknowledge `68:342`, Empty Workbench `69:3`, Run Failure & Missing Context `69:61` and Mobile Run Detail `69:172`. Status chips and the reporting-boundary banner use existing semantic tokens; reported, observed and verified states remain visually and textually distinct.

The FND-00 shell follows the supplied Forge Figma Core reference (`04 — Desktop / Core`, `1:5`; Workspace Home `4:32`). The visual language is graphite/copper: quiet dark surfaces, thin borders, restrained semantic color and copper for focus and emphasis.

Tokens live in `frontend/src/styles/tokens.css` as CSS custom properties. They cover backgrounds, surfaces, borders, typography, spacing, radius, accents, semantic states and focus rings. Components consume those variables rather than scattering color literals. `frontend/src/styles/index.css` is the single stylesheet entrypoint; its imports preserve the former cascade order. Shared rules live under `styles/`, shell and Command Palette rules beside their app owners, and capability-specific rules beside their feature. See the [frontend architecture](architecture/frontend.md#css-ownership-and-order) before adding or moving styles.

Typography uses Geist with system fallbacks for UI text and IBM Plex Mono with monospace fallbacks for labels and compact metadata. The app does not depend on an external font service to start locally. UI-RFX-01 exposes these existing stacks as `--font-ui` and `--font-mono` without changing their values.

The Figma reference contains sample data in several screens. FND-02 replaces it with SQLite-backed records, real counts, six manual board columns and explicit empty/loading/error states. Cards do not present manual state or satisfied criteria as verified, CI-passed or release-ready evidence. The inspected FND-02 references are Project Overview `4:158`, Project Board `4:271` and Feature Detail `5:89`.

## UI-RFX-01 component library

The internal library has three layers:

1. **Foundations** — `tokens.css` provides the palette, typography, spacing,
   radii, semantic states and focus ring. `shared/ui/styles.css` provides the
   shared cascade and reduced-motion behavior.
2. **Primitives** — `Button`, `IconButton`, `FormField`, `TextInput`,
   `Textarea`, `Select`, `Checkbox`, `Card`, `Panel`, `Badge`, `Tabs` and
   `Breadcrumbs` expose small native or presentation contracts.
3. **Composed components** — `MetricCard`, `StatusChip`, `SectionHeader`,
   `LoadingState`, `ErrorState`, `EmptyState` and `ReadOnlyNotice` compose the
   primitives for repeated Forge patterns.

The public API reference is the TypeScript props contract in
`frontend/src/shared/ui/` plus the [component inventory](architecture/ui-component-inventory.md).
Every promoted component has a Gallery example and focused behavior tests.

### Component API reference

| Component | Public contract | Accessibility contract | Styling ownership |
|---|---|---|---|
| `Button` | Native button props, `variant`, `loading`, `loadingLabel` | Native button; `aria-busy` and disabled while loading | `shared/ui/styles.css` |
| `IconButton` | Native button props; caller supplies `aria-label` | Accessible name is required from the caller | `shared/ui/styles.css` |
| `FormField` | `label`, one control, optional `hint`, `error`, `id`, `className` | Connects hint/error through `aria-describedby`; errors use `role=alert` | `shared/ui/styles.css` plus feature layout |
| `MetricCard` | `label`, `value`, `detail`, optional `as` | Text hierarchy; `article` is opt-in for record summaries | `shared/ui/styles.css` |
| `StatusChip` | Domain `status`, display `label`, presentation `variant`, optional class hook | Noninteractive status text; unknown values fall back to neutral | `shared/ui/styles.css` plus feature status variants |
| `Tabs` | Router items `{label,to,active}` and accessible nav label | Current item exposes `aria-current=page` | `shared/ui/styles.css` |
| `Breadcrumbs` | Items `{label,to,current}` | Ordered breadcrumb navigation with current item | `shared/ui/styles.css` and page token rules |
| Feedback states | `LoadingState(label)`, `ErrorState(message,onRetry)`, `EmptyState(title,description,action)`, `ReadOnlyNotice(children)` | Status/alert roles and explicit actions | `shared/ui/styles.css`; feature states may remain local |

### Contribution rules

Before adding a shared component, identify at least two real consumers or a
foundational form/accessibility need. Keep props narrow, preserve native HTML
semantics, add a focused test and Gallery example, and put tokens/CSS under
shared ownership. Do not import feature APIs, routes or business types into
shared UI. Feature-specific empty/loading/error copy should remain local when
it would make the shared contract broader or less truthful.

The Gallery is a development-only route at `/__component-gallery`; it uses the
actual components, does not call live product APIs and is excluded from
production builds by the Vite development guard. Use it at 1440×900 and
390×844 in both themes before changing shared visual contracts.

FND-04 reuses the same shell, tokens and states for the Repositories inventory and Feature Context section. The connected Figma reader exposed FND-04 metadata for `10 — FND-04 / Repositories & Context` (`57:2`) and `11 — FND-04 / States & Components` (`60:2`), plus rendered design context for Project Repositories (`57:5`), Context Package Preview (`58:165`) and the mobile Context Summary (`60:130`). The implementation follows those available graphite/copper layouts and explicitly records any remaining pixel-level comparison as review work rather than claiming broader visual certification.
