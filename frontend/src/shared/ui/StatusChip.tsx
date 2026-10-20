type StatusChipProps = {
  status: string;
  label?: string;
  className?: string;
};

export function StatusChip({
  status,
  label = status.replaceAll("_", " "),
  className,
}: StatusChipProps) {
  return (
    <span
      className={["status-chip", className, status.toLowerCase()]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </span>
  );
}
