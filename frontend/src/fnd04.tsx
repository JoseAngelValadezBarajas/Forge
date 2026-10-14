import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { forgeApi, type ContextPackage, type RepositoryConnection, type Workspace } from "./api";
import { LoadingPanel, PageFrame, ProjectOverviewPage } from "./pages";

type PaletteOpener = (button: HTMLButtonElement) => void;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function shortPath(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : value;
}

function repositoryState(item: RepositoryConnection): string {
  return item.status === "connected" ? "Connected · local only" : "Disconnected · history retained";
}

export function RepositoriesPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const { projectId } = useParams<{ projectId: string }>();
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Optional local Git connections. Forge observes metadata and never changes the repository." title="Repositories">
    <div className="planning-tabs"><Link className="detail-tab" to={`/projects/${projectId}`}>Overview</Link><Link className="detail-tab active" to={`/projects/${projectId}/repositories`}>Repositories</Link><Link className="detail-tab" to={`/projects/${projectId}/board`}>Board</Link></div>
    {workspace && projectId ? <RepositoryInventory compact={false} projectId={projectId} workspace={workspace} /> : <div className="empty-panel"><h2>Select a workspace</h2><p>Create or select a workspace before connecting a repository.</p></div>}
  </PageFrame>;
}

export function ProjectRepositorySection({ workspace, projectId }: { workspace: Workspace; projectId: string }) {
  return <section className="detail-section repository-section"><div className="section-heading"><div><span className="eyebrow accent">OPTIONAL LOCAL GIT</span><h2>Repositories</h2></div><Link className="button ghost" to={`/projects/${projectId}/repositories`}>Open inventory</Link></div><p className="planning-disclaimer">Repositories are optional. Forge reads local Git metadata only; no source content, remotes or credentials are collected.</p><RepositoryInventory compact projectId={projectId} workspace={workspace} /></section>;
}

export function ProjectOverviewWithRepositories({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const { projectId } = useParams<{ projectId: string }>();
  return <><ProjectOverviewPage onOpenPalette={onOpenPalette} workspace={workspace} />{workspace && projectId && <div className="page-frame project-repository-append"><ProjectRepositorySection projectId={projectId} workspace={workspace} /></div>}</>;
}

function RepositoryInventory({ workspace, projectId, compact }: { workspace: Workspace; projectId: string; compact: boolean }) {
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
      const result = await forgeApi.listRepositories(workspace.id, projectId, controller.signal);
      if (!controller.signal.aborted) { setRepositories(Array.isArray(result) ? result : []); setError(null); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load repositories."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [projectId, workspace.id]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => { window.clearTimeout(timer); controllerRef.current?.abort(); }; }, [load]);

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rootPath.trim() || pending) return;
    setPending("connect"); setError(null);
    try { await forgeApi.connectRepository(workspace.id, projectId, rootPath.trim()); setRootPath(""); await load(); }
    catch (cause) { setError(errorMessage(cause, "Could not connect this repository.")); }
    finally { setPending(null); }
  };
  const action = async (repository: RepositoryConnection, kind: "observe" | "disconnect") => {
    if (pending) return;
    setPending(`${kind}:${repository.id}`); setError(null);
    try {
      if (kind === "observe") await forgeApi.observeRepository(workspace.id, projectId, repository.id);
      else await forgeApi.disconnectRepository(workspace.id, projectId, repository.id);
      await load();
    } catch (cause) { setError(errorMessage(cause, "Could not update the repository.")); }
    finally { setPending(null); }
  };
  const visible = compact ? repositories.slice(0, 3) : repositories;
  return <div className={`repository-inventory${compact ? " compact" : ""}`}>
    {!compact && <form className="repository-connect-form" onSubmit={(event) => void connect(event)}><label>Local repository path<input aria-label="Local repository path" onChange={(event) => setRootPath(event.target.value)} placeholder="C:\\work\\project" value={rootPath} /></label><button className="button primary" disabled={!rootPath.trim() || pending !== null} type="submit">{pending === "connect" ? "Connecting..." : "Connect local repo"}</button></form>}
    {error && <p className="status-error" role="alert">{error}</p>}
    {loading ? <LoadingPanel label="Loading repositories" /> : visible.length ? <div className="repository-list">{visible.map((repository) => <article className="repository-card" key={repository.id}><div><span className="mono-label">{repository.status.toUpperCase()}</span><h3>{shortPath(repository.root_path)}</h3><p>{repositoryState(repository)}</p>{repository.last_observed_at && <small>Last observation {new Date(repository.last_observed_at).toLocaleString()}</small>}</div><div className="repository-actions"><button className="button secondary" disabled={pending !== null || repository.status !== "connected"} onClick={() => void action(repository, "observe")} type="button">{pending === `observe:${repository.id}` ? "Observing..." : "Observe now"}</button><button className="button ghost" disabled={pending !== null || repository.status !== "connected"} onClick={() => void action(repository, "disconnect")} type="button">Disconnect</button></div></article>)}</div> : <div className="quiet-empty-row"><span className="mono-label">NO REPOSITORIES</span><span>Connect a local Git repository when this project has one.</span></div>}
    {!compact && repositories.length > visible.length && <Link className="button ghost" to={`/projects/${projectId}/repositories`}>View all {repositories.length} repositories</Link>}
  </div>;
}

export function ContextPackageSection({ workspace, projectId, featureId }: { workspace: Workspace; projectId: string; featureId: string }) {
  const [repositories, setRepositories] = useState<RepositoryConnection[]>([]);
  const [linked, setLinked] = useState<RepositoryConnection[]>([]);
  const [packages, setPackages] = useState<ContextPackage[]>([]);
  const [preview, setPreview] = useState<ContextPackage | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    try {
      const [all, featureRepos, history] = await Promise.all([
        forgeApi.listRepositories(workspace.id, projectId, controller.signal),
        forgeApi.listFeatureRepositories(workspace.id, projectId, featureId, controller.signal),
        forgeApi.listContextPackages(workspace.id, projectId, featureId, controller.signal),
      ]);
      if (!controller.signal.aborted) { setRepositories(Array.isArray(all) ? all : []); setLinked(Array.isArray(featureRepos) ? featureRepos : []); setPackages(Array.isArray(history) ? history : []); setError(null); }
    } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load context packages.")); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [featureId, projectId, workspace.id]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => { window.clearTimeout(timer); loadController.current?.abort(); }; }, [load]);
  const linkedIds = useMemo(() => new Set(linked.map((item) => item.id)), [linked]);
  const available = repositories.filter((item) => !linkedIds.has(item.id) && item.status === "connected");
  const link = async () => {
    if (!selected || pending) return;
    setPending("link"); setError(null);
    try { await forgeApi.linkFeatureRepository(workspace.id, projectId, featureId, selected); setSelected(""); await load(); }
    catch (cause) { setError(errorMessage(cause, "Could not link repository.")); }
    finally { setPending(null); }
  };
  const unlink = async (repositoryId: string) => {
    if (pending) return;
    setPending(`unlink:${repositoryId}`); setError(null);
    try { await forgeApi.unlinkFeatureRepository(workspace.id, projectId, featureId, repositoryId); await load(); }
    catch (cause) { setError(errorMessage(cause, "Could not unlink repository.")); }
    finally { setPending(null); }
  };
  const generate = async (kind: "preview" | "save") => {
    if (pending) return;
    setPending(kind); setError(null);
    try {
      const next = kind === "preview" ? await forgeApi.previewContextPackage(workspace.id, projectId, featureId) : await forgeApi.saveContextPackage(workspace.id, projectId, featureId);
      setPreview(next);
      if (kind === "save") await load();
    } catch (cause) { setError(errorMessage(cause, "Could not build the context package.")); }
    finally { setPending(null); }
  };
  return <section className="detail-section context-package-section"><div className="section-heading"><div><span className="eyebrow accent">DETERMINISTIC CONTEXT</span><h2>Context package</h2></div><span className="status-chip neutral">{packages.length} saved</span></div><p className="planning-disclaimer">Preview and save the planning context for this Feature. The package is metadata-only and never includes source content or machine paths.</p>{error && <p className="status-error" role="alert">{error}</p>}{loading ? <LoadingPanel label="Loading context" /> : <><div className="context-links"><div><h3>Linked repositories</h3>{linked.length ? <ul className="dependency-list">{linked.map((item) => <li key={item.id}><span>{shortPath(item.root_path)}</span><button className="button ghost" disabled={pending !== null} onClick={() => void unlink(item.id)} type="button">{pending === `unlink:${item.id}` ? "Removing..." : "Unlink"}</button></li>)}</ul> : <p>No repositories linked to this Feature.</p>}</div><div className="inline-link-form"><label>Repository<select aria-label="Repository to link" onChange={(event) => setSelected(event.target.value)} value={selected}><option value="">Select connected repository</option>{available.map((item) => <option key={item.id} value={item.id}>{shortPath(item.root_path)}</option>)}</select></label><button className="button secondary" disabled={!selected || pending !== null} onClick={() => void link()} type="button">{pending === "link" ? "Linking..." : "Link"}</button></div></div><div className="detail-actions"><button className="button secondary" disabled={pending !== null} onClick={() => void generate("preview")} type="button">{pending === "preview" ? "Building..." : "Preview package"}</button><button className="button primary" disabled={pending !== null} onClick={() => void generate("save")} type="button">{pending === "save" ? "Saving..." : "Generate & save"}</button></div>{preview && <PackagePreview packageData={preview} />}{packages.length ? <div className="context-history"><h3>Saved package history</h3>{packages.map((item) => <div className="history-row" key={item.id}><span>{item.created_at ? new Date(item.created_at).toLocaleString() : "Preview"}</span><strong>{item.schema_version}</strong><span>{item.fingerprint.slice(0, 12)}</span>{item.id && <a className="button ghost" href={`/api/workspaces/${workspace.id}/projects/${projectId}/features/${featureId}/context/packages/${item.id}/download?format=markdown`}>Download</a>}</div>)}</div> : <div className="quiet-empty-row">No immutable packages saved yet. Preview does not create history.</div>}</>}</section>;
}

export function FeatureContextPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const { projectId, featureId } = useParams<{ projectId: string; featureId: string }>();
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="An immutable, deterministic planning snapshot for this Feature." title="Context package"><div className="planning-tabs"><Link className="detail-tab" to={`/projects/${projectId}/features/${featureId}`}>Feature detail</Link><Link className="detail-tab active" to={`/projects/${projectId}/features/${featureId}/context`}>Context</Link></div>{workspace && projectId && featureId ? <ContextPackageSection featureId={featureId} projectId={projectId} workspace={workspace} /> : <div className="empty-panel"><h2>Select a workspace</h2><p>Context packages are scoped to a Feature and Project.</p></div>}</PageFrame>;
}

function PackagePreview({ packageData }: { packageData: ContextPackage }) {
  const feature = packageData.payload.feature as { title?: string; key?: string } | undefined;
  const readiness = packageData.payload.readiness as { outcome?: string; stale?: boolean } | null | undefined;
  return <div className="context-preview"><div className="section-heading"><div><h3>Current preview</h3><p>{feature?.key} · {feature?.title}</p></div><code>{packageData.fingerprint.slice(0, 16)}</code></div><span className="mono-label">{packageData.schema_version}</span><p>{readiness?.outcome ?? "No saved readiness evaluation"}{readiness?.stale ? " · STALE" : ""}</p><span className="planning-disclaimer">JSON and Markdown downloads are available for saved snapshots.</span><span className="mono-label">Saved snapshots provide JSON and Markdown downloads.</span></div>;
}
