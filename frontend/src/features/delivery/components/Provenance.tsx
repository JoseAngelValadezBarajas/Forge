export function Provenance({ value }: { value: string }) {
  return <span className={`status-chip ${value.toLowerCase()}`}>{value}</span>;
}
