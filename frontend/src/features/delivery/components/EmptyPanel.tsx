import { Link } from "react-router-dom";

export function EmptyPanel({
  title,
  description,
  action,
  to,
}: {
  title: string;
  description: string;
  action?: string;
  to: string;
}) {
  return (
    <div className="projects-empty fnd06-empty">
      <span className="eyebrow">EMPTY EVIDENCE</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && (
        <Link className="button primary" to={to}>
          {action}
        </Link>
      )}
    </div>
  );
}
