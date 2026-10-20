# Forge shared UI component inventory

This is the current, code-backed inventory for UI-RFX-01. It records public
contracts, ownership and adoption; it is not a request to build speculative
components.

## Ownership rules

- `frontend/src/shared/ui/` contains domain-independent presentation and
  interaction contracts. It does not import `app`, `features`, API modules or
  routes.
- Feature modules consume shared UI directly. Feature wrappers are allowed
  when they preserve domain copy or an existing CSS contract.
- Shared CSS lives in `shared/ui/styles.css` or `styles/tokens.css`; feature CSS
  may extend a shared class only with a feature namespace.
- Promote a pattern only when at least two product surfaces share its markup,
  semantics and state behavior, or when the contract is a foundational control
  used by multiple forms.
- Product-specific loading, error, empty and compact planning states remain
  local until their semantics are genuinely interchangeable.

## Design foundations

| Foundation | Source | Meaning and contract | Status |
|---|---|---|---|
| Graphite/copper colors | `styles/tokens.css` | `--bg`, surfaces, borders, text, accent and semantic colors; no component hardcodes palette values | IMPLEMENTED |
| Typography | `--font-ui`, `--font-mono` | Geist/system UI text and IBM Plex Mono/Consolas metadata without external font loading | IMPLEMENTED |
| Spacing and radius | `--space-*`, `--radius-*` | Four-pixel spacing rhythm and small/medium/large surfaces | IMPLEMENTED |
| Focus and interaction | `--focus`, shared focus selectors, disabled selectors | Visible keyboard focus; disabled controls do not advertise an action | IMPLEMENTED |
| Responsive and motion | shared CSS media queries and `prefers-reduced-motion` | Grid collapse at narrow widths; reduced motion disables nonessential transitions | IMPLEMENTED |
| Elevation | `--shadow-dialog`, raised surfaces | Dialog shadow remains app-owned; cards use border/surface contrast rather than speculative elevation | IMPLEMENTED |

## Shared components

| Component | Responsibility and public props | Variants/states | Consumers | Accessibility and styling | Tests / Figma | Classification |
|---|---|---|---|---|---|---|
| `Button` | Native button props plus `variant`, `loading`, `loadingLabel` | primary, secondary, ghost, disabled, loading | Project, Epic and Feature forms; gallery | Native button semantics; loading sets `aria-busy` and disables; `shared/ui/styles.css` | `core.test.tsx`; Gallery actions; graphite/copper shell references | IMPLEMENTED |
| `IconButton` | Native button props with a caller-owned accessible label | default, disabled | Epic, Feature and Decision form close controls; gallery | Requires caller-provided accessible name; shared focus | `core.test.tsx`; Gallery | IMPLEMENTED |
| `FormField` | Label, optional hint/error and one native control | hint, error, wide layout | Project, Planning and Decision forms; gallery | Adds stable `aria-describedby` links and `role=alert` error | `core.test.tsx`; Figma form language | IMPLEMENTED |
| `TextInput` | Forwarding wrapper for native input | all native input states | Project and Planning forms; gallery | Native input contract preserved | `core.test.tsx`; Figma forms | IMPLEMENTED |
| `Textarea` | Forwarding wrapper for native textarea | rows, resize, disabled | Project and Planning forms; gallery | Native textarea contract preserved | `core.test.tsx`; Figma forms | IMPLEMENTED |
| `Select` | Forwarding wrapper for native select | selected, disabled | Planning forms; gallery | Native combobox semantics | `core.test.tsx`; Figma forms | IMPLEMENTED |
| `Checkbox` | Forwarding wrapper for checkbox input | checked, disabled | Delivery `MultiSelect`; gallery | Native checkbox semantics and label ownership | `core.test.tsx`; Figma form controls | IMPLEMENTED |
| `Card` | Generic div surface for domain-neutral content | default and caller class | Gallery; available for future matching product cards | No interactive meaning imposed; shared surface CSS | `core.test.tsx`; Figma cards | IMPLEMENTED |
| `Panel` | Generic section surface preserving caller semantics | default and caller class | Workbench panels; gallery | Section semantics remain caller-owned | `core.test.tsx`; Figma Workbench density | IMPLEMENTED |
| `MetricCard` | Label, value, detail; optional `as="article"` | div/article | Projects Home, Workbench, Delivery | Text hierarchy; shared metric CSS moved out of Projects | existing and regression tests; Figma metric cards | IMPLEMENTED |
| `StatusChip` | Domain `status`, display `label`, explicit `variant`, feature class hook | neutral fallback plus semantic variants | Workbench statuses and Delivery provenance | Unknown values retain a safe neutral tone; status classes remain compatible | existing tests; Figma status treatments | IMPLEMENTED |
| `Badge` | Small noninteractive label with `tone` | neutral, accent, success, warning, danger, info | StatusChip and gallery | Noninteractive text; tone is presentation only | `core.test.tsx`; Gallery | IMPLEMENTED |
| `SectionHeader` | Heading with optional eyebrow, count or actions | title/count/actions | Workspace Home and gallery; raw matching headings remain compatible | Heading order remains caller/page-owned; shared layout CSS | `core.test.tsx`; shell references | IMPLEMENTED |
| `Tabs` | Router links from `{label,to,active}` items | active/inactive | Project Overview and Delivery navigation; gallery | `aria-current="page"` for current route; keyboard-native links | `core.test.tsx`; Figma navigation | IMPLEMENTED |
| `Breadcrumbs` | Generic `{label,to,current}` trail | linked/current | `ProjectBreadcrumbs` adapter; gallery | `nav[aria-label=Breadcrumb]`, ordered list and current item | `core.test.tsx`; Figma shell | IMPLEMENTED |
| `LoadingState` | Full-width loading feedback from `label` | loading | `LoadingPanel` compatibility facade; gallery | `role=status`, visible label and decorative spinner | `core.test.tsx`; existing loading surfaces | IMPLEMENTED |
| `ErrorState` | Error message and retry callback | error/retry | `ErrorPanel` compatibility facade; gallery | `role=alert`, visible retry button | `core.test.tsx`; existing error surfaces | IMPLEMENTED |
| `EmptyState` | Honest title, description and optional action | empty with/without action | Gallery; product empty layouts remain local | Heading and explicit next action; no fake records | `core.test.tsx`; Gallery | REQUIRES_MIGRATION |
| `ReadOnlyNotice` | Noninteractive read-only explanation | notice | Gallery; feature-specific archived copy remains local | `role=status`; no mutation affordance | `core.test.tsx`; Gallery | REQUIRES_MIGRATION |
| `PageFrame` | Product page title, subtitle, breadcrumbs and palette trigger | default/breadcrumbs | All major page surfaces | Heading and caller-owned navigation | existing page tests; Figma shell | IMPLEMENTED |
| `DownloadLink` | Browser/Desktop authenticated download adapter | browser, Tauri pending/error | Import/export, context and delivery | Link remains a link; errors are announced | existing transfer tests; Figma actions | IMPLEMENTED |

## Deliberately local or not needed

| Pattern | Classification | Reason |
|---|---|---|
| Workbench `Loading` and `ErrorBox` | FEATURE_LOCAL | FND-05 copy and layout intentionally differ from global data feedback. |
| Projects and Delivery empty panels | FEATURE_LOCAL | Their actions, copy and product semantics differ from a generic empty state. |
| Planning Home compact metrics | FEATURE_LOCAL | It is a dense planning summary without the MetricCard detail contract. |
| Command Palette dialog | FEATURE_LOCAL | It is a single application-level overlay with specialized keyboard/focus behavior and no second consumer justifying a generic dialog API. |
| Generic data table, tooltip, popover and form wizard | NOT_NEEDED | No current product surface has a stable shared contract; adding them would be speculative. |

## Figma references

The connected Figma file `r10szKLgiIPVi2NBmbjTpm` was used for the
graphite/copper shell, metric cards, status treatments, navigation, responsive
spacing and Workbench/Delivery information density. Inspected nodes include
`4:32`, `4:158`, `4:271`, `5:89`, `57:5`, `60:130` and `67:3`. Node `1:5`
was not selectable through the connected reader; this inventory does not claim
pixel-level parity for that node.

## Adding a shared component

1. Establish at least two real consumers or record why a foundational control
   is required.
2. Define a small TypeScript contract; prefer composition over unrelated
   boolean props.
3. Add focused behavior/accessibility tests and a Gallery example.
4. Put shared selectors in `shared/ui/styles.css` and consume tokens.
5. Run Vitest, lint, typecheck, architecture checks, build and the Gallery
   Chromium check before changing the classification to IMPLEMENTED.
