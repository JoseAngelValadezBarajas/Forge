/* API-loading effects synchronize external SQLite-backed state and are guarded by AbortController. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  forgeApi,
  type AgentRun,
  type RunStatus,
  type Workspace,
} from "../../../../api";
import { PageFrame } from "../../../../shared/ui/PageFrame";
import { StatusChip } from "../../../../shared/ui/StatusChip";
import { type PaletteOpener } from "../../pages/types";
import { errorMessage } from "../../utils";
import { Loading } from "../../components/Loading";
import { ErrorBox } from "../../components/ErrorBox";

export function RunInventoryPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("project") ?? undefined;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RunStatus | "">("");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspace) {
      setRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await forgeApi.listRuns(
        workspace.id,
        { projectId, search, status: status || undefined },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setRuns(result);
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(errorMessage(cause, "Could not load runs."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [projectId, search, status, workspace]);
  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Provider-neutral records with immutable planning inputs."
      title="Agent Runs"
    >
      <div className="section-heading fnd05-toolbar">
        <div>
          <span className="eyebrow accent">WORKBENCH / RUNS</span>
          <p>Records describe reported work; they do not prove delivery.</p>
        </div>
        <Link className="button primary" to="/workbench/runs/new">
          + New run
        </Link>
      </div>
      <section className="fnd05-filters">
        <label>
          Search runs
          <input
            aria-label="Search runs"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search titles"
            value={search}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Run status"
            onChange={(event) =>
              setStatus(event.target.value as RunStatus | "")
            }
            value={status}
          >
            <option value="">All recorded states</option>
            {[
              "PLANNED",
              "IN_PROGRESS",
              "AWAITING_HANDOFF",
              "COMPLETED",
              "FAILED",
              "CANCELLED",
            ].map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </section>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => void load()} />
      ) : (
        <section className="fnd05-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">RUN INVENTORY</span>
              <h2>Recorded runs</h2>
            </div>
            <span className="mono-label">{runs.length} records</span>
          </div>
          {runs.length ? (
            <div className="fnd05-stack">
              {runs.map((run) => (
                <Link
                  className="fnd05-card"
                  key={run.id}
                  to={`/projects/${run.project_id}/runs/${run.id}`}
                >
                  <div>
                    <span className="mono-label">{run.id}</span>
                    <h3>{run.title}</h3>
                    <p>
                      {run.context_schema_version} ·{" "}
                      {run.context_fingerprint.slice(0, 12)}… · Feature{" "}
                      {run.feature_id.slice(0, 8)}
                    </p>
                  </div>
                  <StatusChip className="fnd05-status" status={run.status} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="quiet-empty-row">
              <span className="mono-label">EMPTY</span>
              <span>No recorded runs match this view.</span>
            </div>
          )}
        </section>
      )}
      {projectId && (
        <button
          className="button ghost"
          onClick={() => setSearchParams({})}
          type="button"
        >
          Clear project filter
        </button>
      )}
    </PageFrame>
  );
}
