import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  forgeApi,
  type Epic,
  type Project,
  type ProjectPlanningOverview,
  type Workspace,
} from "../../../api";
import { ProjectForm } from "../components/ProjectForm";
import { ProjectExportPanel } from "../components/ProjectExportPanel";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { formatDate } from "../../../shared/utils/formatDate";
import { type PaletteOpener } from "./types";

export function ProjectOverviewPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [statusAction, setStatusAction] = useState<
    "archiving" | "restoring" | null
  >(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspace || !projectId) {
      setProject(null);
      setLoading(false);
      return;
    }
    setProject(null);
    setLoading(true);
    try {
      const result = await forgeApi.getProject(
        workspace.id,
        projectId,
        controller.signal,
      );
      if (id !== requestId.current) return;
      setProject(result);
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || id !== requestId.current) return;
      setError(
        cause instanceof Error ? cause.message : "Could not load project.",
      );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [projectId, workspace]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
    };
  }, [load]);
  const update = async (name: string, description: string) => {
    if (!workspace || !project) return;
    setProject(
      await forgeApi.updateProject(workspace.id, project.id, {
        name,
        description,
      }),
    );
    setEditing(false);
  };
  const changeStatus = async () => {
    if (!workspace || !project || statusAction) return;
    const archiving = project.status === "active";
    if (
      archiving &&
      !window.confirm(`Archive ${project.name}? You can restore it later.`)
    )
      return;
    setStatusAction(archiving ? "archiving" : "restoring");
    setStatusMessage(null);
    setStatusError(null);
    try {
      const next = archiving
        ? await forgeApi.archiveProject(workspace.id, project.id)
        : await forgeApi.restoreProject(workspace.id, project.id);
      setProject(next);
      setStatusMessage(archiving ? "Project archived." : "Project restored.");
    } catch (cause) {
      setStatusError(
        cause instanceof Error
          ? cause.message
          : "Could not update project status.",
      );
    } finally {
      setStatusAction(null);
    }
  };
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="A real project record, with persistent planning data and no simulated delivery state."
      title={project?.name ?? "Project overview"}
    >
      {loading ? (
        <LoadingPanel label="Loading project" />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : project ? (
        <>
          <div className="detail-tabs">
            <span className="detail-tab active">Overview</span>
            <Link className="detail-tab" to={`/projects/${project.id}/board`}>
              Board
            </Link>
            <Link
              className="detail-tab"
              to={`/projects/${project.id}/features`}
            >
              Features and Epics
            </Link>
            <Link
              className="detail-tab"
              to={`/projects/${project.id}/decisions`}
            >
              Decisions
            </Link>
            <Link
              className="detail-tab"
              to={`/projects/${project.id}/invariants`}
            >
              Invariants
            </Link>
          </div>
          <section className="project-overview-card">
            <div className="project-overview-header">
              <div>
                <span className="eyebrow">PROJECT</span>
                <h2>{project.name}</h2>
                <p>{project.description || "No description yet."}</p>
              </div>
              <span className={`status-chip ${project.status}`}>
                {project.status}
              </span>
            </div>
            <dl className="project-facts">
              <div>
                <dt>Workspace</dt>
                <dd>{workspace?.name}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(project.created_at)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(project.updated_at)}</dd>
              </div>
              {project.archived_at && (
                <div>
                  <dt>Archived</dt>
                  <dd>{formatDate(project.archived_at)}</dd>
                </div>
              )}
            </dl>
            <div className="detail-actions">
              <button
                className="button secondary"
                onClick={() => setEditing(true)}
                type="button"
              >
                Edit project
              </button>
              <button
                aria-label={
                  statusAction === "archiving"
                    ? "Archiving…"
                    : statusAction === "restoring"
                      ? "Restoring…"
                      : undefined
                }
                className="button secondary"
                disabled={Boolean(statusAction)}
                onClick={() => void changeStatus()}
                type="button"
              >
                {statusAction === "archiving"
                  ? "Archiving..."
                  : statusAction === "restoring"
                    ? "Restoring..."
                    : project.status === "active"
                      ? "Archive"
                      : "Restore"}
              </button>
              <button
                className="button secondary"
                onClick={() => setExportOpen(true)}
                type="button"
              >
                Export project
              </button>
              <button
                className="button ghost"
                onClick={() => navigate("/projects")}
                type="button"
              >
                Back to projects
              </button>
            </div>
            {statusMessage && (
              <p aria-live="polite" className="status-message" role="status">
                {statusMessage}
              </p>
            )}
            {statusError && (
              <p aria-live="assertive" className="status-error" role="alert">
                {statusError}
              </p>
            )}
          </section>
          {exportOpen && workspace && (
            <ProjectExportPanel
              onClose={() => setExportOpen(false)}
              project={project}
              workspace={workspace}
            />
          )}
          {editing && (
            <section className="form-panel">
              <div className="section-heading">
                <h2>Edit project</h2>
                <button
                  aria-label="Close edit project"
                  className="icon-button"
                  onClick={() => setEditing(false)}
                  type="button"
                >
                  x
                </button>
              </div>
              <ProjectForm
                initial={{
                  name: project.name,
                  description: project.description ?? "",
                }}
                onCancel={() => setEditing(false)}
                onSubmit={update}
                submitLabel="Save changes"
              />
            </section>
          )}
          <PlanningSummary projectId={project.id} workspace={workspace} />
          <section className="future-grid">
            <div>
              <span className="eyebrow">REPOSITORY</span>
              <h3>Not connected</h3>
              <p>Repository observation belongs to a later milestone.</p>
            </div>
            <div>
              <span className="eyebrow">DELIVERY</span>
              <h3>Not available</h3>
              <p>Commits, CI and evidence are not fabricated here.</p>
            </div>
          </section>
        </>
      ) : null}
    </PageFrame>
  );
}

function PlanningSummary({
  workspace,
  projectId,
}: {
  workspace: Workspace | null;
  projectId: string;
}) {
  const [overview, setOverview] = useState<ProjectPlanningOverview | null>(
    null,
  );
  const [epics, setEpics] = useState<Epic[]>([]);
  const [decisionCount, setDecisionCount] = useState(0);
  const [invariantCount, setInvariantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (!workspace) return () => controller.abort();
    void Promise.all([
      forgeApi.getPlanningOverview(workspace.id, projectId, controller.signal),
      forgeApi.listEpics(workspace.id, projectId, controller.signal),
      forgeApi.listDecisions(workspace.id, projectId, controller.signal),
      forgeApi.listInvariants(workspace.id, projectId, true, controller.signal),
    ])
      .then(([nextOverview, nextEpics, nextDecisions, nextInvariants]) => {
        setOverview(nextOverview);
        setEpics(Array.isArray(nextEpics) ? nextEpics : []);
        setDecisionCount(
          Array.isArray(nextDecisions) ? nextDecisions.length : 0,
        );
        setInvariantCount(
          Array.isArray(nextInvariants)
            ? nextInvariants.filter((item) => item.status === "active").length
            : 0,
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load planning summary.",
          );
      });
    return () => controller.abort();
  }, [projectId, workspace]);
  return (
    <section className="planning-summary">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PLANNING CONTEXT</span>
          <h2>Intent, decisions and constraints</h2>
        </div>
        <div className="detail-actions">
          <Link
            className="button secondary"
            to={`/projects/${projectId}/board`}
          >
            Open board
          </Link>
          <Link
            className="button ghost"
            to={`/projects/${projectId}/decisions`}
          >
            Decisions
          </Link>
          <Link
            className="button ghost"
            to={`/projects/${projectId}/invariants`}
          >
            Invariants
          </Link>
        </div>
      </div>
      {error ? (
        <p className="status-error" role="alert">
          {error}
        </p>
      ) : overview ? (
        <>
          <div className="planning-metrics">
            <div>
              <strong>{overview.epics}</strong>
              <span>Epics</span>
            </div>
            <div>
              <strong>{overview.features}</strong>
              <span>Features</span>
            </div>
            <div>
              <strong>{overview.tasks}</strong>
              <span>Tasks</span>
            </div>
            <div>
              <strong>
                {overview.satisfied_criteria}/{overview.acceptance_criteria}
              </strong>
              <span>Criteria declared</span>
            </div>
            <div>
              <strong>{overview.dependencies}</strong>
              <span>Dependencies</span>
            </div>
            <div>
              <strong>{decisionCount}</strong>
              <span>Decisions</span>
            </div>
            <div>
              <strong>{invariantCount}</strong>
              <span>Active invariants</span>
            </div>
          </div>
          <p className="planning-disclaimer">
            Manual planning state only. No repository, CI, verification or
            release evidence is inferred.
          </p>
          {epics.length > 0 && (
            <div className="summary-epics">
              {epics.slice(0, 4).map((epic) => (
                <span className="status-chip neutral" key={epic.id}>
                  {epic.title}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <LoadingPanel label="Loading planning summary" />
      )}
    </section>
  );
}
