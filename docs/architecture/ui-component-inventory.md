# UI component inventory

This inventory records the actual frontend component ownership after UI-RFX-01.
It is a migration guide, not a speculative component library.

## Shared UI

| Component | Current owner | Consumers | Contract |
|---|---|---|---|
| `MetricCard` | `shared/ui/MetricCard.tsx` | Projects Home, Workbench Overview, Delivery Overview | Label, value, detail; optional `article` semantic element |
| `StatusChip` | `shared/ui/StatusChip.tsx` | Workbench statuses, Delivery provenance | Status class, normalized label, optional feature class/label |
| `LoadingPanel` | `shared/ui/LoadingPanel.tsx` | Planning and data pages | Full feedback panel with `role="status"` |
| `ErrorPanel` | `shared/ui/ErrorPanel.tsx` | Planning and data pages | Full error panel with required retry action |
| `PageFrame` | `shared/ui/PageFrame.tsx` | Feature pages | Shared page title, subtitle and palette entry point |
| `DownloadLink` | `shared/ui/DownloadLink.tsx` | Export/context/delivery flows | Browser or authenticated Desktop download |
| `ProjectBreadcrumbs` | `shared/ui/ProjectBreadcrumbs.tsx` | Project detail surfaces | Project navigation context |

## Intentionally feature-local

| Component/pattern | Owner | Why it is not promoted in UI-RFX-01 |
|---|---|---|
| Workbench `Loading` | `features/workbench/components/Loading.tsx` | Uses the Workbench-specific `fnd05-feedback` layout and copy defaults. |
| Workbench `ErrorBox` | `features/workbench/components/ErrorBox.tsx` | Retry is optional and it intentionally omits the shared global error heading. |
| Projects `EmptyPanel` | `features/projects/pages/HomePage.tsx` | Its action is a React Router `NavLink` and its empty-workspace copy/layout are product-specific. |
| Delivery `EmptyPanel` | `features/delivery/components/EmptyPanel.tsx` | Evidence/release empty states use `projects-empty fnd06-empty` and optional action semantics. |
| Projects `SectionHeading` | `features/projects/components/SectionHeading.tsx` | Current stable consumer is Workspace Home; other headings vary by heading level, actions and metadata. |
| Planning Home `Metric` | `features/projects/components/ProjectPlanningHome.tsx` | Compact planning-count layout has different class hooks and no detail text. |

## Ownership rules

- Shared UI imports only React and shared primitives/types; it never imports a
  feature, route, API capability or app shell.
- Feature modules may consume shared UI directly. A feature-specific wrapper is
  acceptable when it preserves a domain label or CSS contract, as
  `delivery/components/Provenance.tsx` does for `StatusChip`.
- Promote a component only after at least two consumers share markup,
  semantics and state behavior. Similar class names alone are not sufficient.
- Keep feature CSS beside the feature. Add a shared selector only when the
  selector is used by a shared contract and does not depend on a feature
  namespace.

## Figma review coverage

The connected Figma file `r10szKLgiIPVi2NBmbjTpm` was used as visual reference
for the graphite/copper shell, metric cards, status treatments, responsive
spacing and Workbench/Delivery information density. Inspected node IDs are
`4:32`, `4:158`, `4:271`, `5:89`, `57:5`, `60:130` and `67:3`. Node `1:5`
was not selectable through the connected reader, so this inventory does not
claim pixel-level parity for that single node.
