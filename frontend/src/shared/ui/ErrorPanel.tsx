import { ErrorState } from "./feedback";

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorState message={message} onRetry={onRetry} />;
}
