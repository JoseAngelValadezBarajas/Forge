# Roadmap

- **FND-00** — Bootstrap, local runtime, app shell, empty states and health endpoint.
- **FND-01** — Workspaces and projects, with persistent selection, real CRUD and explicit not-yet integration states.
- **FND-02** — Product hierarchy: epics, features and tasks.
- **FND-03** — Readiness workflow, decisions and invariants.
- **FND-04** — Optional local Git connections, read-only deterministic observations and immutable `forge-context-v1` Context Packages. No source scanning, remotes, network operations or delivery evidence.
- **FND-05** — Agent runs, human-reported events, immutable handoff revisions and explicit review acknowledgements. No agent execution or delivery evidence is implemented.
- **FND-06** — Evidence provenance, deterministic checks over saved Forge snapshots, immutable Release Candidates, explainable gates and `NOT_PUBLISHED` manifests. It does not import artifact bytes, execute tests, integrate remote CI, write Git or publish releases. See [FND-06 limitations](product/fnd06-evidence-and-releases.md).
- **DESK-01** — Windows Desktop Alpha packaging of the existing planning product using Tauri, a Rust-owned authenticated local sidecar and per-user SQLite. It adds no planning capability; acceptance depends on an installed-product Windows smoke and is not inferred from a successful build.

Cloud accounts, automatic agent execution, external provider sync, authentication, multi-user collaboration and Electron remain outside the current foundation scope.

FND-02 adds persistent epics, features, tasks, acceptance criteria, dependencies and a manual planning board. FND-03 adds revisioned decisions, scoped invariants, revision-aware acknowledgements and deterministic readiness snapshots. It must not be inferred from FND-02 manual states or satisfied acceptance criteria, and it does not introduce repositories, agents, Git or delivery evidence.

