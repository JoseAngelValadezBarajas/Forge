import { useState } from "react";
import { Link } from "react-router-dom";
import { type Feature, type FeatureStatus } from "../../../api";
import { statuses, label } from "../utils";

export function FeatureCard({
  feature,
  onStatusChange,
  disabled,
}: {
  feature: Feature;
  onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<boolean>;
  disabled: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const nextStatus =
    statuses[(statuses.indexOf(feature.status) + 1) % statuses.length];
  const move = async () => {
    setSaving(true);
    try {
      await onStatusChange(feature, nextStatus);
    } finally {
      setSaving(false);
    }
  };
  return (
    <article className="feature-card">
      <Link
        className="feature-card-link"
        to={`/projects/${feature.project_id}/features/${feature.id}`}
      >
        <span className="mono-label">{feature.key}</span>
        <h3>{feature.title}</h3>
        <div className="feature-card-meta">
          <span className={`priority-chip ${feature.priority}`}>
            {feature.priority}
          </span>
          {feature.epic_id && <span className="mono-label">Epic</span>}
        </div>
      </Link>
      <button
        aria-label={`Move ${feature.key} to ${label(nextStatus)}`}
        className="card-move"
        disabled={saving || disabled}
        onClick={() => void move()}
        type="button"
      >
        {saving ? "..." : `Move to ${label(nextStatus)}`}
      </button>
    </article>
  );
}
