import { useState } from "react";
import { Link } from "react-router-dom";
import { type Feature, type FeatureStatus } from "../../../api";
import { statuses, label } from "../utils";

export function FeatureCard({
  feature,
  onStatusChange,
  disabled,
  epicTitle,
}: {
  feature: Feature;
  onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<boolean>;
  disabled: boolean;
  epicTitle?: string;
}) {
  const [saving, setSaving] = useState(false);
  const changeStatus = async (status: FeatureStatus) => {
    if (status === feature.status) return;
    setSaving(true);
    try {
      await onStatusChange(feature, status);
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
          {feature.epic_id && (
            <span className="mono-label">{epicTitle ?? "Epic"}</span>
          )}
        </div>
      </Link>
      <label className="card-status-control">
        <span>Status</span>
        <select
          aria-label={`Status for ${feature.key}`}
          className="card-status-select"
          disabled={saving || disabled}
          onChange={(event) =>
            void changeStatus(event.target.value as FeatureStatus)
          }
          value={feature.status}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {label(status)}
            </option>
          ))}
        </select>
      </label>
      {/* The controlled value intentionally remains the persisted status until the API succeeds. */}
      <span aria-live="polite" className="card-status-state">
        {saving ? "Saving..." : `Current: ${label(feature.status)}`}
      </span>
    </article>
  );
}
