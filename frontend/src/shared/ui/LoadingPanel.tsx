import { LoadingState } from "./feedback";

export function LoadingPanel({ label }: { label: string }) {
  return <LoadingState label={label} />;
}
