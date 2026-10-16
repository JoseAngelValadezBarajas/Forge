export function SectionHeading({
  title,
  count,
}: {
  title: string;
  count: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      <span>{count}</span>
    </div>
  );
}
