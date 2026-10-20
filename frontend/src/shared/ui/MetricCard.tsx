type MetricCardProps = {
  label: string;
  value: number | string;
  detail: string;
  as?: "div" | "article";
};

export function MetricCard({
  label,
  value,
  detail,
  as = "div",
}: MetricCardProps) {
  const Component = as;
  return (
    <Component className="metric-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </Component>
  );
}
