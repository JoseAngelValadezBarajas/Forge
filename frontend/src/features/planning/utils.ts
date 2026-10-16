import {
  type EpicStatus,
  type FeaturePriority,
  type FeatureStatus,
} from "../../api";

export const statuses: FeatureStatus[] = [
  "backlog",
  "refining",
  "ready",
  "in_progress",
  "verify",
  "done",
];

export const priorities: FeaturePriority[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const epicStatuses: EpicStatus[] = ["planning", "archived"];

export function label(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function moveIds<T extends { id: string }>(
  items: T[],
  index: number,
  direction: "up" | "down",
): string[] {
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= items.length)
    return items.map((item) => item.id);
  const ids = items.map((item) => item.id);
  [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
  return ids;
}
