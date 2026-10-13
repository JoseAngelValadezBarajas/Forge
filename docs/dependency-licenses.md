# Third-party dependency license inventory

This is an engineering inventory for FND-00, not a legal opinion or a replacement for reviewing the license text shipped by each dependency. Direct dependencies were checked from Python package metadata and installed npm package metadata on 2026-10-13. The frontend lockfile remains the source of the resolved npm dependency graph.

## Direct backend dependencies

| Dependency | Declared metadata license |
| --- | --- |
| Alembic | MIT |
| FastAPI | MIT |
| pydantic-settings | MIT |
| SQLAlchemy | MIT |
| Uvicorn | BSD-3-Clause |
| httpx (development) | BSD-3-Clause |
| mypy (development) | MIT |
| pytest (development) | MIT |
| ruff (development) | MIT |

## Direct frontend dependencies

The direct runtime dependencies are React, React DOM and React Router DOM; their package metadata declares MIT. The direct development dependencies are primarily MIT, with `@playwright/test` and TypeScript declaring Apache-2.0. The remaining direct development packages in `frontend/package.json` declare MIT in their installed metadata.

## Transitive inventory observations

The current `frontend/package-lock.json` metadata contains MIT, ISC, MIT-0, Apache-2.0, BSD-2-Clause, BSD-3-Clause, MPL-2.0, CC-BY-4.0 and BlueOak-1.0.0 entries. Notable non-MIT transitive packages include:

- `caniuse-lite`: CC-BY-4.0;
- `lightningcss` platform packages: MPL-2.0; and
- `minimatch`: BlueOak-1.0.0.

No direct dependency metadata inspected for FND-00 reported GPL, AGPL or SSPL. This does not determine every obligation for every distribution form. Before redistributing a compiled application or bundling dependencies, review the complete resolved graph, preserve required notices and confirm the applicable source/binary distribution obligations.

The repository does not commit `node_modules`, generated frontend `dist` output or Python virtual-environment files. No external code or asset was copied from the Figma reference into FND-00; Figma was used as a design reference only. Third-party dependency rights remain separate from the Forge Community and Forge Commercial terms.
