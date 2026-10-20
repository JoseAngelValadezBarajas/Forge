import { StatusChip } from "../../../shared/ui/StatusChip";

export function Provenance({ value }: { value: string }) {
  return <StatusChip label={value} status={value} />;
}
