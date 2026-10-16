export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`status-chip fnd05-status ${status.toLowerCase()}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
