import type { ReactNode } from "react";

export function SectionHeader({
  actions,
  count,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  count?: ReactNode;
  eyebrow?: ReactNode;
  title: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow accent">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {actions ?? (count !== undefined ? <span>{count}</span> : null)}
    </div>
  );
}
