export function ReportField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="fnd05-report-field">
      <span className="eyebrow">{label}</span>
      <p>{value || "Nothing reported."}</p>
    </div>
  );
}
