import { type Epic, type Feature, type FeatureStatus } from "../../../api";
import { statuses, label } from "../utils";
import { FeatureCard } from "./FeatureCard";

export function Board({
  features,
  epics,
  onStatusChange,
  disabled,
}: {
  features: Feature[];
  epics: Epic[];
  onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<boolean>;
  disabled: boolean;
}) {
  const epicNames = new Map(epics.map((epic) => [epic.id, epic.title]));
  return (
    <section className="kanban-board" aria-label="Feature workflow board">
      {statuses.map((status) => (
        <div className={`kanban-column status-${status}`} key={status}>
          <div className="kanban-heading">
            <h2>{label(status)}</h2>
            <span>
              {features.filter((feature) => feature.status === status).length}
            </span>
          </div>
          <div className="kanban-cards">
            {features
              .filter((feature) => feature.status === status)
              .map((feature) => (
                <FeatureCard
                  disabled={disabled}
                  feature={feature}
                  epicTitle={feature.epic_id ? epicNames.get(feature.epic_id) : undefined}
                  key={feature.id}
                  onStatusChange={onStatusChange}
                />
              ))}
            {features.every((feature) => feature.status !== status) && (
              <p className="kanban-empty">No features here yet.</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
