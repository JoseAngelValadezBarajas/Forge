import { useEffect, useState } from "react";
import {
  forgeApi,
  type Project,
  type ProjectPlanningOverview,
  type Workspace,
} from "../../../api";
import { transferErrorMessage } from "../../../shared/api/errors";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";

export function ProjectExportPanel({
  workspace,
  project,
  onClose,
}: {
  workspace: Workspace;
  project: Project;
  onClose: () => void;
}) {
  const [overview, setOverview] = useState<ProjectPlanningOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void forgeApi
      .getPlanningOverview(workspace.id, project.id, controller.signal)
      .then((result) => setOverview(result))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(transferErrorMessage(cause).message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [project.id, workspace.id]);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await forgeApi.exportProject(workspace.id, project.id);
    } catch (cause) {
      setDownloadError(transferErrorMessage(cause).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section aria-labelledby="project-export-title" className="transfer-screen form-panel export-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PROJECTS / TRANSFER</span>
          <h2 id="project-export-title">Export project</h2>
        </div>
        <button aria-label="Close export project" className="icon-button" onClick={onClose} type="button">
          x
        </button>
      </div>
      <p className="transfer-subtitle">
        Create a portable JSON planning snapshot without modifying the current Project.
      </p>
      <section className="transfer-card export-identity-card" aria-label="Project export identity">
        <div>
          <span className="eyebrow accent">PROJECT</span>
          <h3>{project.name}</h3>
          <p>{workspace.name} · {project.status === "archived" ? "Archived" : "Active"}</p>
        </div>
        <span className={`status-chip ${project.status}`}>{project.status}</span>
      </section>
      {loading ? (
        <LoadingPanel label="Loading export contents" />
      ) : error ? (
        <p aria-live="assertive" className="status-error" role="alert">{error}</p>
      ) : (
        <div className="transfer-grid export-content-grid">
          <section className="transfer-card" aria-labelledby="export-content-title">
            <span className="eyebrow">EXPORT CONTENT</span>
            <h3 id="export-content-title">Planning snapshot</h3>
            <ul className="transfer-counts export-counts">
              <li><strong>{overview?.epics ?? 0}</strong><span>Epics</span></li>
              <li><strong>{overview?.features ?? 0}</strong><span>Features</span></li>
              <li><strong>{overview?.tasks ?? 0}</strong><span>Tasks</span></li>
              <li><strong>{overview?.acceptance_criteria ?? 0}</strong><span>Criteria</span></li>
              <li><strong>{overview?.dependencies ?? 0}</strong><span>Dependencies</span></li>
            </ul>
            <p className="planning-disclaimer">
              Exported criteria remain planning declarations. No implementation, verification or evidence is inferred.
            </p>
          </section>
          <section className="transfer-card" aria-labelledby="export-excluded-title">
            <span className="eyebrow">NOT PART OF THIS EXPORT</span>
            <h3 id="export-excluded-title">Operational records stay local</h3>
            <ul className="transfer-excluded-list">
              <li>Decisions and Invariants</li>
              <li>Agent Runs and Handoffs</li>
              <li>Git observations and repositories</li>
              <li>Evidence, verifications and release history</li>
            </ul>
          </section>
        </div>
      )}
      <section className="transfer-card export-file-card" aria-label="Export file details">
        <div>
          <span className="eyebrow">FILE DETAILS</span>
          <h3>forge-project-{project.id}-import-v1.json</h3>
          <p>Forge Project Import v1 · JSON · Downloads folder</p>
        </div>
        <p className="planning-disclaimer">This is a portable planning snapshot, not a backup.</p>
      </section>
      {downloadError && (
        <p aria-live="assertive" className="status-error" role="alert">{downloadError}</p>
      )}
      <div className="transfer-footer form-actions">
        <span className="transfer-footer-status">Read-only operation · Existing Project unchanged</span>
        <div className="detail-actions">
          <button className="button secondary" onClick={onClose} type="button">Cancel</button>
          <button className="button primary" disabled={loading || Boolean(error) || downloading} onClick={() => void download()} type="button">
            {downloading ? "Preparing JSON..." : "Download JSON"}
          </button>
        </div>
      </div>
    </section>
  );
}
