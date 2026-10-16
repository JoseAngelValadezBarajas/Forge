export function Loading({
  label = "Loading recorded context…",
}: {
  label?: string;
}) {
  return (
    <div className="fnd05-feedback" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}
