export function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="feedback-panel error-panel" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button className="button secondary" onClick={onRetry} type="button">
          Retry
        </button>
      )}
    </div>
  );
}
