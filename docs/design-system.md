# Design system

The FND-00 shell follows the supplied Forge Figma Core reference (`04 — Desktop / Core`, `1:5`; Workspace Home `4:32`). The visual language is graphite/copper: quiet dark surfaces, thin borders, restrained semantic color and copper for focus and emphasis.

Tokens live in `frontend/src/styles.css` as CSS custom properties. They cover backgrounds, surfaces, borders, typography, spacing, radius, accents, semantic states and focus rings. Components consume those variables rather than scattering color literals.

Typography uses Geist with system fallbacks for UI text and IBM Plex Mono with monospace fallbacks for labels and compact metadata. The app does not depend on an external font service to start locally.

The Figma reference contains sample data in several screens. FND-00 intentionally does not reproduce that data; projects, activity, blockers and delivery evidence render as honest empty states.

