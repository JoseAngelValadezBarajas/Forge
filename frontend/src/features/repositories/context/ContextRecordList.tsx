import { type ContextRecord } from "./types";
import { ContextRecordFields } from "./ContextRecordFields";

export function ContextRecordList({
  title,
  records: items,
  empty,
}: {
  title: string;
  records: ContextRecord[];
  empty: string;
}) {
  return (
    <div className="context-record-list">
      <div className="context-section-heading">
        <h4>{title}</h4>
        <span className="mono-label">{items.length}</span>
      </div>
      {items.length ? (
        items.map((item, index) => (
          <article
            className="context-record-card"
            key={String(item.id ?? index)}
          >
            <span className="mono-label">
              {String(item.id ?? `${title} ${index + 1}`)}
            </span>
            <ContextRecordFields record={item} />
          </article>
        ))
      ) : (
        <p className="context-empty">{empty}</p>
      )}
    </div>
  );
}
