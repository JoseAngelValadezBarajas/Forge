import { type ContextRecord } from "./types";

export function asRecord(value: unknown): ContextRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ContextRecord)
    : {};
}

export function asRecords(value: unknown): ContextRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is ContextRecord =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "")
    return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
