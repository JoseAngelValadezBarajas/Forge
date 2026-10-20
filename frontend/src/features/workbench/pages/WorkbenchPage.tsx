/* API-loading effects synchronize external SQLite-backed state and are guarded by AbortController. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  forgeApi,
  type AgentRun,
  type Handoff,
  type Workspace,
} from "../../../api";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { MetricCard } from "../../../shared/ui/MetricCard";
import { StatusChip } from "../../../shared/ui/StatusChip";
import { Panel } from "../../../shared/ui/Panel";
import { formatDate } from "../../../shared/utils/formatDate";
import { type PaletteOpener } from "./types";
import { errorMessage } from "../utils";
import { Loading } from "../components/Loading";
import { ErrorBox } from "../components/ErrorBox";
import { EmptyWorkbench } from "../components/EmptyWorkbench";
import { ProvenanceBanner } from "../components/ProvenanceBanner";

export function WorkbenchPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspace) {
      setRuns([]);
      setHandoffs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [runItems, projects] = await Promise.all([
        forgeApi.listRuns(workspace.id, {}, controller.signal),
        forgeApi.listProjects(workspace.id, "", "all", controller.signal),
      ]);
      const handoffLists = await Promise.all(
        projects.map((project) =>
          forgeApi.listHandoffs(
            workspace.id,
            project.id,
            {},
            controller.signal,
          ),
        ),
      );
      if (!controller.signal.aborted) {
        setRuns(runItems);
        setHandoffs(handoffLists.flat());
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(errorMessage(cause, "Could not load the Workbench."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [workspace]);
  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);
  const activeRuns = runs.filter(
    (item) => !["COMPLETED", "FAILED", "CANCELLED"].includes(item.status),
  ).length;
  const readyHandoffs = handoffs.filter(
    (item) => item.status === "READY",
  ).length;
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="A durable place for human-reported work, pinned context and handoffs."
      title="Workbench"
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => void load()} />
      ) : (
        <>
          <div className="metric-grid">
            <MetricCard
              label="Recorded runs"
              value={runs.length}
              detail="Human-reported"
            />
            <MetricCard
              label="Active records"
              value={activeRuns}
              detail="Not process telemetry"
            />
            <MetricCard
              label="Handoffs ready"
              value={readyHandoffs}
              detail="Awaiting review"
            />
            <MetricCard
              label="Context snapshots"
              value={new Set(runs.map((item) => item.context_package_id)).size}
              detail="Immutable inputs"
            />
          </div>
          <div className="fnd05-grid">
            <Panel className="fnd05-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">RECENT RUN ACTIVITY</span>
                  <h2>Recorded runs</h2>
                </div>
                <Link className="button primary" to="/workbench/runs/new">
                  + Record run
                </Link>
              </div>
              {runs.length ? (
                <div className="fnd05-stack">
                  {runs.slice(0, 5).map((run) => (
                    <Link
                      className="fnd05-card"
                      key={run.id}
                      to={`/projects/${run.project_id}/runs/${run.id}`}
                    >
                      <div>
                        <span className="mono-label">
                          {run.id.slice(0, 8).toUpperCase()}
                        </span>
                        <h3>{run.title}</h3>
                        <p>
                          Feature {run.feature_id.slice(0, 8)} · updated{" "}
                          {formatDate(run.updated_at)}
                        </p>
                      </div>
                      <StatusChip className="fnd05-status" status={run.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyWorkbench />
              )}
            </Panel>
            <aside className="fnd05-side-stack">
              <section className="fnd05-panel">
                <span className="eyebrow">HANDOFFS AWAITING REVIEW</span>
                <strong className="fnd05-big-number">{readyHandoffs}</strong>
                <p>
                  Each handoff captures what was reported, what remains and
                  which context follows.
                </p>
                <Link className="button secondary" to="/workbench/handoffs">
                  Open handoffs →
                </Link>
              </section>
              <ProvenanceBanner />
            </aside>
          </div>
          <Panel className="fnd05-panel fnd05-flow">
            <span className="eyebrow accent">FEATURE RELATIONSHIP</span>
            <h2>From Feature to recorded execution</h2>
            <p>
              Feature → immutable Context Package → Run → reported events →
              Handoff → later verification.
            </p>
          </Panel>
        </>
      )}
    </PageFrame>
  );
}
