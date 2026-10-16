import { useMemo } from "react";

export function ScopeCount({
  title,
  ids,
  labels,
}: {
  title: string;
  ids: string[];
  labels: { id: string; label: string }[];
}) {
  const byId = useMemo(
    () => new Map(labels.map((item) => [item.id, item.label])),
    [labels],
  );
  return (
    <div>
      <span className="eyebrow">
        {title} · {ids.length}
      </span>
      {ids.length ? (
        <ul>
          {ids.map((id) => (
            <li key={id}>{byId.get(id) ?? id}</li>
          ))}
        </ul>
      ) : (
        <p className="muted-copy">None pinned</p>
      )}
    </div>
  );
}
