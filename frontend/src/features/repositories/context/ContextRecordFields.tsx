import { type ContextRecord } from "./types";
import { displayValue } from "./format";

export function ContextRecordFields({ record }: { record: ContextRecord }) {
  return (
    <dl className="context-record-fields">
      {Object.entries(record).map(([key, value]) => (
        <div key={key}>
          <dt>{key.replaceAll("_", " ")}</dt>
          <dd>{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
