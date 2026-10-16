export function LoadingPanel({ label }: { label: string }) {
  return <div className="feedback-panel" role="status"><span className="spinner" aria-hidden="true" />{label}...</div>;
}
