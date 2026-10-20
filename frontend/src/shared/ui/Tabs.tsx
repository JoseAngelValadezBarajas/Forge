import { Link } from "react-router-dom";

export function Tabs({
  "aria-label": ariaLabel = "Sections",
  className,
  items,
}: {
  "aria-label"?: string;
  className?: string;
  items: Array<{ active?: boolean; label: string; to: string }>;
}) {
  return (
    <nav aria-label={ariaLabel} className={["detail-tabs", className].filter(Boolean).join(" ")}>
      {items.map((item) => (
        <Link aria-current={item.active ? "page" : undefined} className={`detail-tab${item.active ? " active" : ""}`} key={item.to} to={item.to}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
