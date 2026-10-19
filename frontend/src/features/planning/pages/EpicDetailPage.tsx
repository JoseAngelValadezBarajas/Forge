import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  forgeApi,
  type Epic,
  type Feature,
  type Project,
  type Workspace,
} from "../../../api";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { ProjectBreadcrumbs } from "../../../shared/ui/ProjectBreadcrumbs";
import { EpicEditForm } from "../components/EpicEditForm";
import { label } from "../utils";
type PaletteOpener = (button: HTMLButtonElement) => void;

export function EpicDetailPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const { projectId, epicId } = useParams<{
    projectId: string;
    epicId: string;
  }>();
  const [project, setProject] = useState<Project | null>(null);
  const [epic, setEpic] = useState<Epic | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const canMutate = project?.status === "active";
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspace || !projectId || !epicId) {
      setLoading(false);
      setError("Epic context is unavailable.");
      return;
    }
    setLoading(true);
    try {
      const [nextProject, epics, nextFeatures] = await Promise.all([
        forgeApi.getProject(workspace.id, projectId, controller.signal),
        forgeApi.listEpics(workspace.id, projectId, controller.signal),
        forgeApi.listFeatures(
          workspace.id,
          projectId,
          { epicId },
          controller.signal,
        ),
      ]);
      if (currentRequest !== requestId.current) return;
      setProject(nextProject);
      setEpic(epics.find((item) => item.id === epicId) ?? null);
      setFeatures(Array.isArray(nextFeatures) ? nextFeatures : []);
      setError(null);
    } catch (cause) {
      if (!controller.signal.aborted && currentRequest === requestId.current) {
        setError(cause instanceof Error ? cause.message : "Could not load Epic.");
      }
    } finally {
      if (!controller.signal.aborted && currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }, [epicId, projectId, workspace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
    };
  }, [load]);

  const updateEpic = async (payload: {
    title: string;
    description: string;
    status: "planning" | "archived";
  }): Promise<boolean> => {
    if (!workspace || !projectId || !epic || !canMutate || saving) return false;
    setSaving(true);
    try {
      setEpic(
        await forgeApi.updateEpic(workspace.id, projectId, epic.id, payload),
      );
      setEditing(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update Epic.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageFrame
      breadcrumbs={
        project && epic ? (
          <ProjectBreadcrumbs
            current="Epic"
            parent={{ label: "Features", to: `/projects/${project.id}/features` }}
            project={project}
            workspace={workspace}
          />
        ) : undefined
      }
      onOpenPalette={onOpenPalette}
      subtitle="An Epic groups intent without implying implementation evidence."
      title={epic?.title ?? "Epic detail"}
    >
      {loading ? (
        <LoadingPanel label="Loading Epic" />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : epic && project ? (
        <>
          <section className="feature-detail-header">
            <div>
              <span className="eyebrow">EPIC · {label(epic.status)}</span>
              <h2>{epic.title}</h2>
              <p>{epic.description || "No description yet."}</p>
            </div>
            {canMutate ? (
              <div className="detail-actions">
                <button className="button secondary" onClick={() => setEditing(true)} type="button">
                  Edit epic
                </button>
                <Link className="button primary" to={`/projects/${project.id}/features?create=1&epic=${epic.id}`}>
                  + Create feature
                </Link>
              </div>
            ) : (
              <div className="planning-read-only" role="status">
                Archived project · planning is read-only.
              </div>
            )}
          </section>
          {editing && canMutate && (
            <EpicEditForm
              actionPending={saving}
              epic={epic}
              onCancel={() => setEditing(false)}
              onSubmit={updateEpic}
            />
          )}
          <section className="detail-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">LINKED FEATURES</span>
                <h2>Features in this Epic</h2>
              </div>
              <span>{features.length} total</span>
            </div>
            {features.length ? (
              <ul className="planning-list">
                {features.map((feature) => (
                  <li key={feature.id}>
                    <Link
                      className="planning-item-copy"
                      to={`/projects/${project.id}/features/${feature.id}`}
                    >
                      <span className="mono-label">{feature.key}</span>
                      <strong>{feature.title}</strong>
                    </Link>
                    <span className={`status-chip ${feature.status}`}>
                      {label(feature.status)}
                    </span>
                    <Link className="button ghost" to={`/projects/${project.id}/features/${feature.id}`}>
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="quiet-empty-row">No Features are linked to this Epic yet.</div>
            )}
          </section>
        </>
      ) : null}
    </PageFrame>
  );
}
