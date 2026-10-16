import { type RepositoryConnection } from "../../api";

export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function shortPath(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : value;
}

export function repositoryState(item: RepositoryConnection): string {
  return item.status === "connected"
    ? "Connected · local only"
    : "Disconnected · history retained";
}
