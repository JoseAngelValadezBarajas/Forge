export type ContextRecord = Record<string, unknown>;

export type ContextSectionId =
  | "overview"
  | "planning"
  | "dependencies"
  | "decisions"
  | "invariants"
  | "readiness"
  | "git"
  | "provenance";

export const contextSections: Array<{ id: ContextSectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "planning", label: "Tasks & criteria" },
  { id: "dependencies", label: "Dependencies" },
  { id: "decisions", label: "Decisions" },
  { id: "invariants", label: "Invariants" },
  { id: "readiness", label: "Readiness" },
  { id: "git", label: "Git observations" },
  { id: "provenance", label: "Provenance & limits" },
];
