import type { ReactNode } from "react";

export function LoadingState({ label }: { label: string }) {
  return <div aria-label={label} className="feedback-panel" role="status"><span className="spinner" aria-hidden="true" />{label}...</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="feedback-panel error-panel" role="alert"><strong>Could not load Forge data.</strong><span>{message}</span><button className="button secondary" onClick={onRetry} type="button">Retry</button></div>;
}

export function EmptyState({ action, description, title }: { action?: ReactNode; description: string; title: string }) {
  return <section className="empty-state"><span aria-hidden="true" className="empty-orbit">∅</span><h2>{title}</h2><p>{description}</p>{action}</section>;
}

export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return <p className="read-only-notice" role="status">{children}</p>;
}
