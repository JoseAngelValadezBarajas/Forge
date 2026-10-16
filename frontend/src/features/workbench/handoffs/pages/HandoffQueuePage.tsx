/* API-loading effects synchronize external SQLite-backed state and are guarded by AbortController. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  forgeApi,
  type Handoff,
  type HandoffStatus,
  type Project,
  type Workspace,
} from "../../../../api";
import { PageFrame } from "../../../../shared/ui/PageFrame";
import { type PaletteOpener } from "../../pages/types";
import { errorMessage } from "../../utils";
import { Loading } from "../../components/Loading";
import { ErrorBox } from "../../components/ErrorBox";
import { StatusChip } from "../../components/StatusChip";
import { ProvenanceBanner } from "../../components/ProvenanceBanner";

export function HandoffQueuePage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<HandoffStatus | "">("");
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!workspace) return;
    const controller = new AbortController();
    void forgeApi
      .listProjects(workspace.id, "", "all", controller.signal)
      .then((items) => {
        setProjects(items);
        setProjectId((current) =>
          items.some((item) => item.id === current)
            ? current
            : (items[0]?.id ?? ""),
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(errorMessage(cause, "Could not load projects."));
      });
    return () => controller.abort();
  }, [workspace]);
  const load = useCallback(async () => {
    if (!workspace || !projectId) {
      setHandoffs([]);
      setLoading(false);
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const items = await forgeApi.listHandoffs(
        workspace.id,
        projectId,
        { status: status || undefined },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setHandoffs(items);
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(errorMessage(cause, "Could not load handoffs."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [projectId, status, workspace]);
  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Draft, ready and acknowledged handoffs with human-visible provenance."
      title="Handoff Queue"
    >
      <div className="section-heading fnd05-toolbar">
        <div>
          <span className="eyebrow accent">WORKBENCH / HANDOFFS</span>
          <p>
            A ready handoff is prepared for review, not received by an external
            agent.
          </p>
        </div>
        <Link className="button primary" to="/workbench/runs/new">
          + New handoff from a run
        </Link>
      </div>
      <section className="fnd05-filters">
        <label>
          Project
          <select
            aria-label="Handoff project"
            onChange={(event) => setProjectId(event.target.value)}
            value={projectId}
          >
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            aria-label="Handoff status"
            onChange={(event) =>
              setStatus(event.target.value as HandoffStatus | "")
            }
            value={status}
          >
            <option value="">All handoff states</option>
            {["DRAFT", "READY", "ACKNOWLEDGED", "WITHDRAWN"].map((item) => (
              <option key={item} value={item}>
                {item}
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
              <span className="eyebrow">HANDOFF INBOX</span>
              <h2>Handoffs</h2>
            </div>
            <span className="mono-label">{handoffs.length} records</span>
          </div>
          {handoffs.length ? (
            <div className="fnd05-stack">
              {handoffs.map((item) => (
                <Link
                  className="fnd05-card"
                  key={item.id}
                  to={`/projects/${item.project_id}/handoffs/${item.id}`}
                >
                  <div>
                    <span className="mono-label">{item.id}</span>
                    <h3>{item.title}</h3>
                    <p>
                      Run {item.run_id.slice(0, 8)} · Feature{" "}
                      {item.feature_id.slice(0, 8)}
                    </p>
                  </div>
                  <StatusChip status={item.status} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="quiet-empty-row">
              <span className="mono-label">EMPTY</span>
              <span>No handoffs are recorded for this project.</span>
            </div>
          )}
        </section>
      )}
      <ProvenanceBanner />
    </PageFrame>
  );
}
