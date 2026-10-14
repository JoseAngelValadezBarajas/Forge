# Roadmap

- **FND-00** — Bootstrap, local runtime, app shell, empty states and health endpoint.
- **FND-01** — Workspaces and projects, with persistent selection, real CRUD and explicit not-yet integration states.
- **FND-02** — Product hierarchy: epics, features and tasks.
- **FND-03** — Readiness workflow, decisions and invariants.
- **FND-04** — Optional local Git connections, read-only deterministic observations and immutable `forge-context-v1` Context Packages. No source scanning, remotes, network operations or delivery evidence.
- **FND-05** — Agent runs, human-reported events, immutable handoff revisions and explicit review acknowledgements. No agent execution or delivery evidence is implemented.
- **FND-06** — Workbench and release views grounded in real local evidence.

Cloud accounts, automatic agent execution, external provider sync, authentication, multi-user collaboration and Electron remain outside the current foundation scope.

FND-02 adds persistent epics, features, tasks, acceptance criteria, dependencies and a manual planning board. FND-03 adds revisioned decisions, scoped invariants, revision-aware acknowledgements and deterministic readiness snapshots. It must not be inferred from FND-02 manual states or satisfied acceptance criteria, and it does not introduce repositories, agents, Git or delivery evidence.

