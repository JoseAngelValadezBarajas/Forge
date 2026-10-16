import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forgeApi,
  type ContextPackage,
  type RepositoryConnection,
  type Workspace,
} from "../../../api";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { errorMessage, shortPath } from "../utils";
import { PackagePreview } from "./PackagePreview";

function packageDownloadUrl(
  workspaceId: string,
  projectId: string,
  featureId: string,
  packageId: string,
  format: "json" | "markdown",
) {
  return `/api/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/context/packages/${packageId}/download?format=${format}`;
}

export function ContextPackageSection({
  workspace,
  projectId,
  featureId,
}: {
  workspace: Workspace;
  projectId: string;
  featureId: string;
}) {
  const [repositories, setRepositories] = useState<RepositoryConnection[]>([]);
  const [linked, setLinked] = useState<RepositoryConnection[]>([]);
  const [packages, setPackages] = useState<ContextPackage[]>([]);
  const [preview, setPreview] = useState<ContextPackage | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    try {
      const [all, featureRepos, history] = await Promise.all([
        forgeApi.listRepositories(workspace.id, projectId, controller.signal),
        forgeApi.listFeatureRepositories(
          workspace.id,
          projectId,
          featureId,
          controller.signal,
        ),
        forgeApi.listContextPackages(
          workspace.id,
          projectId,
          featureId,
          controller.signal,
        ),
      ]);
      if (!controller.signal.aborted) {
        setRepositories(Array.isArray(all) ? all : []);
        setLinked(Array.isArray(featureRepos) ? featureRepos : []);
        setPackages(Array.isArray(history) ? history : []);
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(errorMessage(cause, "Could not load context packages."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [featureId, projectId, workspace.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      loadController.current?.abort();
    };
  }, [load]);
  const linkedIds = useMemo(
    () => new Set(linked.map((item) => item.id)),
    [linked],
  );
  const available = repositories.filter(
    (item) => !linkedIds.has(item.id) && item.status === "connected",
  );
  const link = async () => {
    if (!selected || pending) return;
    setPending("link");
    setError(null);
    setNotice(null);
    try {
      await forgeApi.linkFeatureRepository(
        workspace.id,
        projectId,
        featureId,
        selected,
      );
      setSelected("");
      setNotice("Repository linked to this Feature.");
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not link repository."));
    } finally {
      setPending(null);
    }
  };
  const unlink = async (repositoryId: string) => {
    if (pending) return;
    setPending(`unlink:${repositoryId}`);
    setError(null);
    setNotice(null);
    try {
      await forgeApi.unlinkFeatureRepository(
        workspace.id,
        projectId,
        featureId,
        repositoryId,
      );
      setNotice("Repository unlinked from this Feature.");
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not unlink repository."));
    } finally {
      setPending(null);
    }
  };
  const generate = async (kind: "preview" | "save") => {
    if (pending) return;
    setPending(kind);
    setError(null);
    setNotice(null);
    try {
      const next =
        kind === "preview"
          ? await forgeApi.previewContextPackage(
              workspace.id,
              projectId,
              featureId,
            )
          : await forgeApi.saveContextPackage(
              workspace.id,
              projectId,
              featureId,
            );
      setPreview(next);
      setNotice(
        kind === "preview"
          ? "Preview refreshed. No history was created."
          : "Immutable Context Package saved.",
      );
      if (kind === "save") await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not build the context package."));
    } finally {
      setPending(null);
    }
  };
  return (
    <section className="detail-section context-package-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow accent">DETERMINISTIC CONTEXT</span>
          <h2>Context package</h2>
        </div>
        <span className="status-chip neutral">{packages.length} saved</span>
      </div>
      <p className="planning-disclaimer">
        Review every exported section before saving. Planning is declared
        context; Git is read-only observed metadata and never delivery
        verification.
      </p>
      {error && (
        <p className="status-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p aria-live="polite" className="status-message" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <LoadingPanel label="Loading context" />
      ) : (
        <>
          <div className="context-links">
            <div>
              <h3>Linked repositories</h3>
              {linked.length ? (
                <ul className="dependency-list">
                  {linked.map((item) => (
                    <li key={item.id}>
                      <span>{shortPath(item.root_path)}</span>
                      <button
                        className="button ghost"
                        disabled={pending !== null}
                        onClick={() => void unlink(item.id)}
                        type="button"
                      >
                        {pending === `unlink:${item.id}`
                          ? "Removing..."
                          : "Unlink"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No repositories linked to this Feature.</p>
              )}
            </div>
            <div className="inline-link-form">
              <label>
                Repository
                <select
                  aria-label="Repository to link"
                  onChange={(event) => setSelected(event.target.value)}
                  value={selected}
                >
                  <option value="">Select connected repository</option>
                  {available.map((item) => (
                    <option key={item.id} value={item.id}>
                      {shortPath(item.root_path)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button secondary"
                disabled={!selected || pending !== null}
                onClick={() => void link()}
                type="button"
              >
                {pending === "link" ? "Linking..." : "Link"}
              </button>
            </div>
          </div>
          <div className="detail-actions">
            <button
              className="button secondary"
              disabled={pending !== null}
              onClick={() => void generate("preview")}
              type="button"
            >
              {pending === "preview" ? "Building..." : "Preview package"}
            </button>
            <button
              className="button primary"
              disabled={pending !== null}
              onClick={() => void generate("save")}
              type="button"
            >
              {pending === "save" ? "Saving..." : "Generate & save"}
            </button>
          </div>
          {preview && (
            <PackagePreview
              downloadBase={(id, format) =>
                packageDownloadUrl(
                  workspace.id,
                  projectId,
                  featureId,
                  id,
                  format,
                )
              }
              packageData={preview}
            />
          )}
          {packages.length ? (
            <div className="context-history">
              <div className="section-heading">
                <h3>Saved package history</h3>
                <span className="planning-disclaimer">
                  Immutable snapshots · JSON and Markdown
                </span>
              </div>
              {packages.map((item) => (
                <div className="history-row" key={item.id}>
                  <span>
                    {item.created_at
                      ? new Date(item.created_at).toLocaleString()
                      : "Preview"}
                  </span>
                  <strong>{item.schema_version}</strong>
                  <span>{item.fingerprint.slice(0, 12)}</span>
                  {item.id && (
                    <>
                      <a
                        aria-label={`Download JSON ${item.fingerprint.slice(0, 12)}`}
                        className="button ghost"
                        href={packageDownloadUrl(
                          workspace.id,
                          projectId,
                          featureId,
                          item.id,
                          "json",
                        )}
                      >
                        JSON
                      </a>
                      <a
                        aria-label={`Download Markdown ${item.fingerprint.slice(0, 12)}`}
                        className="button ghost"
                        href={packageDownloadUrl(
                          workspace.id,
                          projectId,
                          featureId,
                          item.id,
                          "markdown",
                        )}
                      >
                        Markdown
                      </a>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="quiet-empty-row">
              No immutable packages saved yet. Preview does not create history.
            </div>
          )}
        </>
      )}
    </section>
  );
}
