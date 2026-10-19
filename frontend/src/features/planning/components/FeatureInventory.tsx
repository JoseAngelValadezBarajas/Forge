import { type Epic, type Feature, type FeatureStatus } from "../../../api";
import { Link } from "react-router-dom";
import { type PlanningData } from "../hooks/usePlanningData";
import { FeatureCard } from "./FeatureCard";
import { label } from "../utils";

export function FeatureInventory({
  data,
  onStatusChange,
  onEditEpic,
  disabled,
}: {
  data: PlanningData;
  onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<boolean>;
  onEditEpic: (epic: Epic) => void;
  disabled: boolean;
}) {
  const epicNames = new Map(data.epics.map((epic) => [epic.id, epic.title]));
  return (
    <div className="inventory-grid">
      <section>
        <div className="section-heading">
          <h2>Features</h2>
          <span>{data.features.length} total</span>
        </div>
        {data.features.length ? (
          <div className="feature-list">
            {data.features.map((feature) => (
              <FeatureCard
                disabled={disabled}
                feature={feature}
                epicTitle={feature.epic_id ? epicNames.get(feature.epic_id) : undefined}
                key={feature.id}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        ) : (
          <div className="quiet-empty-row">
            No features exist yet. Create the first planning record.
          </div>
        )}
      </section>
      <aside>
        <div className="section-heading">
          <h2>Epics</h2>
          <span>{data.epics.length} total</span>
        </div>
        {data.epics.length ? (
          <div className="epic-list">
            {data.epics.map((epic) => (
              <article className="epic-card" key={epic.id}>
                <span className="mono-label">EPIC</span>
                <h3>
                  <Link to={`/projects/${epic.project_id}/epics/${epic.id}`}>
                    {epic.title}
                  </Link>
                </h3>
                <p>{epic.description || "No description yet."}</p>
                <span className="status-chip neutral">
                  {label(epic.status)}
                </span>
                <button
                  className="button ghost"
                  disabled={disabled}
                  onClick={() => onEditEpic(epic)}
                  type="button"
                >
                  Edit epic
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="quiet-empty-row">No epics yet.</div>
        )}
        <div className="planning-disclaimer">
          Manual planning state. Satisfied criteria are user declarations, not
          evidence.
        </div>
      </aside>
    </div>
  );
}
