import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  forgeApi,
  type RepositoryConnection,
  type Workspace,
} from "../../../api";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { errorMessage, shortPath, repositoryState } from "../utils";

export function RepositoryInventory({
  workspace,
  projectId,
  compact,
}: {
  workspace: Workspace;
  projectId: string;
  compact: boolean;
}) {
  const [repositories, setRepositories] = useState<RepositoryConnection[]>([]);
  const [rootPath, setRootPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const result = await forgeApi.listRepositories(
        workspace.id,
        projectId,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setRepositories(Array.isArray(result) ? result : []);
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(errorMessage(cause, "Could not load repositories."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [projectId, workspace.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [load]);

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rootPath.trim() || pending) return;
    setPending("connect");
    setError(null);
    try {
      await forgeApi.connectRepository(
        workspace.id,
        projectId,
        rootPath.trim(),
      );
      setRootPath("");
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not connect this repository."));
    } finally {
      setPending(null);
    }
  };
  const action = async (
    repository: RepositoryConnection,
    kind: "observe" | "disconnect",
  ) => {
    if (pending) return;
    setPending(`${kind}:${repository.id}`);
    setError(null);
    try {
      if (kind === "observe")
        await forgeApi.observeRepository(
          workspace.id,
          projectId,
          repository.id,
        );
      else
        await forgeApi.disconnectRepository(
          workspace.id,
          projectId,
          repository.id,
        );
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not update the repository."));
    } finally {
      setPending(null);
    }
  };
  const visible = compact ? repositories.slice(0, 3) : repositories;
  return (
    <div className={`repository-inventory${compact ? " compact" : ""}`}>
      {!compact && (
        <form
          className="repository-connect-form"
          onSubmit={(event) => void connect(event)}
        >
          <label>
            Local repository path
            <input
              aria-label="Local repository path"
              onChange={(event) => setRootPath(event.target.value)}
              placeholder="C:\\work\\project"
              value={rootPath}
            />
          </label>
          <button
            className="button primary"
            disabled={!rootPath.trim() || pending !== null}
            type="submit"
          >
            {pending === "connect" ? "Connecting..." : "Connect local repo"}
          </button>
        </form>
      )}
      {error && (
        <p className="status-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <LoadingPanel label="Loading repositories" />
      ) : visible.length ? (
        <div className="repository-list">
          {visible.map((repository) => (
            <article className="repository-card" key={repository.id}>
              <div>
                <span className="mono-label">
                  {repository.status.toUpperCase()}
                </span>
                <h3>{shortPath(repository.root_path)}</h3>
                <p>{repositoryState(repository)}</p>
                {repository.last_observed_at && (
                  <small>
                    Last observation{" "}
                    {new Date(repository.last_observed_at).toLocaleString()}
                  </small>
                )}
              </div>
              <div className="repository-actions">
                <button
                  className="button secondary"
                  disabled={
                    pending !== null || repository.status !== "connected"
                  }
                  onClick={() => void action(repository, "observe")}
                  type="button"
                >
                  {pending === `observe:${repository.id}`
                    ? "Observing..."
                    : "Observe now"}
                </button>
                <button
                  className="button ghost"
                  disabled={
                    pending !== null || repository.status !== "connected"
                  }
                  onClick={() => void action(repository, "disconnect")}
                  type="button"
                >
                  Disconnect
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="quiet-empty-row">
          <span className="mono-label">NO REPOSITORIES</span>
          <span>Connect a local Git repository when this project has one.</span>
        </div>
      )}
      {!compact && repositories.length > visible.length && (
        <Link
          className="button ghost"
          to={`/projects/${projectId}/repositories`}
        >
          View all {repositories.length} repositories
        </Link>
      )}
    </div>
  );
}
