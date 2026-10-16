export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="feedback-panel error-panel" role="alert"><strong>Could not load Forge data.</strong><span>{message}</span><button className="button secondary" onClick={onRetry} type="button">Retry</button></div>;
}
