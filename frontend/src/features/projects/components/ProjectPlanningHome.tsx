import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  forgeApi,
  type Epic,
  type Feature,
  type Project,
  type ProjectPlanningOverview,
  type Workspace,
} from "../../../api";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { label } from "../../planning";

const priorityOrder = new Map([
  ["critical", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3],
]);

export function ProjectPlanningHome({
  workspace,
  project,
}: {
  workspace: Workspace | null;
  project: Pick<Project, "id" | "name">;
}) {
  const [overview, setOverview] = useState<ProjectPlanningOverview | null>(
    null,
  );
  const [epics, setEpics] = useState<Epic[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [decisionCount, setDecisionCount] = useState(0);
  const [invariantCount, setInvariantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const controller = new AbortController();
    if (!workspace) {
      setOverview(null);
      setEpics([]);
      setFeatures([]);
      setDecisionCount(0);
      setInvariantCount(0);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const [nextOverview, nextEpics, nextFeatures, nextDecisions, nextInvariants] =
        await Promise.all([
          forgeApi.getPlanningOverview(workspace.id, project.id, controller.signal),
          forgeApi.listEpics(workspace.id, project.id, controller.signal),
          forgeApi.listFeatures(workspace.id, project.id, {}, controller.signal),
          forgeApi.listDecisions(workspace.id, project.id, controller.signal),
          forgeApi.listInvariants(workspace.id, project.id, true, controller.signal),
        ]);
      if (currentRequest !== requestId.current) return;
      setOverview(nextOverview);
      setEpics(Array.isArray(nextEpics) ? nextEpics : []);
      setFeatures(Array.isArray(nextFeatures) ? nextFeatures : []);
      setDecisionCount(Array.isArray(nextDecisions) ? nextDecisions.length : 0);
      setInvariantCount(
        Array.isArray(nextInvariants)
          ? nextInvariants.filter((item) => item.status === "active").length
          : 0,
      );
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || currentRequest !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load planning home.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [project.id, workspace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const epicNames = useMemo(
    () => new Map(epics.map((epic) => [epic.id, epic.title])),
    [epics],
  );
  const pendingFeatures = useMemo(
    () =>
      features
        .filter((feature) => feature.status !== "done")
        .sort(
          (left, right) =>
            (priorityOrder.get(left.priority) ?? 99) -
              (priorityOrder.get(right.priority) ?? 99) ||
            right.updated_at.localeCompare(left.updated_at),
        )
        .slice(0, 4),
    [features],
  );

  if (loading) return <LoadingPanel label="Loading planning home" />;
  if (error) return <ErrorPanel message={error} onRetry={() => void load()} />;

  return (
    <section className="project-planning-home" aria-label="Project planning home">
      <div className="section-heading">
        <div>
          <span className="eyebrow accent">PLANNING / {project.name}</span>
          <h2>Por dónde continuar</h2>
          <p className="planning-home-subtitle">
            Trabajo pendiente ordenado por prioridad, separado de lo terminado.
          </p>
        </div>
        <div className="detail-actions">
          <Link className="button secondary" to={`/projects/${project.id}/features`}>
            View all features
          </Link>
          <Link className="button primary" to={`/projects/${project.id}/features?create=1`}>
            + Create feature
          </Link>
        </div>
      </div>
      {overview && (
        <div className="planning-home-metrics" aria-label="Planning counts">
          <Metric label="Features" value={overview.features} />
          <Metric label="Tasks" value={overview.tasks} />
          <Metric label="Epics" value={overview.epics} />
          <Metric label="Criteria declared" value={`${overview.satisfied_criteria}/${overview.acceptance_criteria}`} />
          <Metric label="Dependencies" value={overview.dependencies} />
        </div>
      )}
      <div className="planning-home-grid">
        <section className="planning-home-priorities">
          <div className="section-heading">
            <h3>Pending work</h3>
            <span>{pendingFeatures.length} shown</span>
          </div>
          {pendingFeatures.length ? (
            <div className="planning-home-feature-list">
              {pendingFeatures.map((feature) => (
                <Link
                  className="planning-home-feature"
                  key={feature.id}
                  to={`/projects/${project.id}/features/${feature.id}`}
                >
                  <span>
                    <strong>{feature.key} · {feature.title}</strong>
                    <small>
                      Feature · {feature.epic_id ? `Epic: ${epicNames.get(feature.epic_id) ?? "Unknown Epic"}` : "No Epic"}
                    </small>
                  </span>
                  <span className={`status-chip ${feature.status}`}>
                    {label(feature.status)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="quiet-empty-row">No pending planning work. Create a Feature when the next intent is known.</div>
          )}
        </section>
        <aside className="planning-home-actions">
          <div className="section-heading"><h3>Quick actions</h3></div>
          <Link className="button secondary" to={`/projects/${project.id}/epics`}>Explore Epics</Link>
          <Link aria-label="Open board" className="button secondary" to={`/projects/${project.id}/board`}>Open Board</Link>
          <Link className="button secondary" to={`/projects/${project.id}/features?create=1`}>Create Feature</Link>
          <div className="planning-home-context">
            <strong>Understand the hierarchy</strong>
            <p>Epic = iniciativa mayor. Feature = resultado concreto. Task = trabajo necesario para entregarlo.</p>
            <p>Los estados del Board representan planificación, no evidencia verificada.</p>
          </div>
        </aside>
      </div>
      <p className="planning-disclaimer">
        Planning only · {decisionCount} decisions · {invariantCount} active invariants. No implementation or delivery evidence is inferred.
      </p>
    </section>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: number | string }) {
  return (
    <div className="planning-home-metric">
      <strong className="planning-home-metric-value">{value}</strong>
      <span>{metricLabel}</span>
    </div>
  );
}
