# Context Package schema

Forge Context Packages use the versioned schema identifier `forge-context-v1`.

The canonical JSON document contains:

- `project`: project name, description and lifecycle status;
- `feature`: opaque Feature ID, readable key, title, description, goal, priority and status;
- `planning`: ordered tasks and acceptance criteria;
- `dependencies`: normalized dependency IDs and direction;
- `decisions`: linked decision content, status, revision and supersession pointer;
- `invariants`: applicable statement, rationale, scope, revision and acknowledgement revision;
- `readiness`: latest saved planning evaluation, rule set, fingerprint, outcome, blockers and stale state, when one exists; and
- `git_observations`: selected opaque observation and repository IDs, observation timestamp, HEAD/branch state, clean state and counters.

The package deliberately excludes local filesystem paths, remote URLs, credentials, author identities, commit messages, diffs, source content, untracked file names and delivery verification. A Git observation's `error_detail` is not included because it may contain machine-specific paths.

Text is Unicode NFKC-normalized, line endings are normalized, and surrounding/inline horizontal whitespace is made stable. Records are sorted by stable IDs and positional fields before JSON serialization. The SHA-256 fingerprint is calculated over the exact UTF-8 canonical JSON using sorted keys and compact separators. Markdown and JSON exports are generated from the same snapshot; Markdown is not hashed separately.

Preview is never persisted. Generate & save creates an immutable snapshot and deduplicates an identical Feature/schema/fingerprint combination. A later planning or Git observation change creates a new fingerprint while preserving prior packages.

FND-04 does not claim that an observed repository is clean, verified or safe to release. Git metadata is context only.
