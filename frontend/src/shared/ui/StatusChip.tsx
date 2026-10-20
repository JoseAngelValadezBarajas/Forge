type StatusChipProps = {
  status: string;
  label?: string;
  className?: string;
  variant?: string;
};

function statusClass(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9_-]+/g, "_");
}

export function StatusChip({
  status,
  label = status.replaceAll("_", " "),
  className,
  variant = "neutral",
}: StatusChipProps) {
  return (
    <span className={["status-chip", statusClass(variant), className, statusClass(status)].filter(Boolean).join(" ")}>
      {label}
    </span>
  );
}
