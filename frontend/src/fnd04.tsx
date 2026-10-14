import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { forgeApi, type ContextPackage, type RepositoryConnection, type Workspace } from "./api";
import { LoadingPanel, PageFrame, ProjectOverviewPage } from "./pages";

type PaletteOpener = (button: HTMLButtonElement) => void;
type ContextRecord = Record<string, unknown>;
type ContextSectionId = "overview" | "planning" | "dependencies" | "decisions" | "invariants" | "readiness" | "git" | "provenance";

const contextSections: Array<{ id: ContextSectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "planning", label: "Tasks & criteria" },
  { id: "dependencies", label: "Dependencies" },
  { id: "decisions", label: "Decisions" },
  { id: "invariants", label: "Invariants" },
  { id: "readiness", label: "Readiness" },
  { id: "git", label: "Git observations" },
  { id: "provenance", label: "Provenance & limits" },
];

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

function asRecord(value: unknown): ContextRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as ContextRecord : {};
}

function asRecords(value: unknown): ContextRecord[] {
  return Array.isArray(value) ? value.filter((item): item is ContextRecord => typeof item === "object" && item !== null && !Array.isArray(item)) : [];
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ContextRecordFields({ record }: { record: ContextRecord }) {
  return <dl className="context-record-fields">{Object.entries(record).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{displayValue(value)}</dd></div>)}</dl>;
}

function ContextRecordList({ title, records: items, empty }: { title: string; records: ContextRecord[]; empty: string }) {
  return <div className="context-record-list"><div className="context-section-heading"><h4>{title}</h4><span className="mono-label">{items.length}</span></div>{items.length ? items.map((item, index) => <article className="context-record-card" key={String(item.id ?? index)}><span className="mono-label">{String(item.id ?? `${title} ${index + 1}`)}</span><ContextRecordFields record={item} /></article>) : <p className="context-empty">{empty}</p>}</div>;
}

function ContextSectionContent({ section, payload }: { section: ContextSectionId; payload: ContextRecord }) {
  const project = asRecord(payload.project);
  const feature = asRecord(payload.feature);
  const planning = asRecord(payload.planning);
  const readiness = payload.readiness ? asRecord(payload.readiness) : null;
  switch (section) {
    case "overview":
      return <div className="context-overview-grid"><article className="context-record-card"><span className="mono-label">PROJECT DECLARATION</span><ContextRecordFields record={project} /></article><article className="context-record-card"><span className="mono-label">FEATURE DECLARATION</span><ContextRecordFields record={feature} /></article></div>;
    case "planning":
      return <div className="context-record-stack"><ContextRecordList empty="No tasks are included." records={asRecords(planning.tasks)} title="Tasks" /><ContextRecordList empty="No acceptance criteria are included." records={asRecords(planning.acceptance_criteria)} title="Acceptance criteria" /></div>;
    case "dependencies":
      return <ContextRecordList empty="No dependencies are included." records={asRecords(payload.dependencies)} title="Dependencies and direction" />;
    case "decisions":
      return <ContextRecordList empty="No linked decisions are included." records={asRecords(payload.decisions)} title="Decisions and revisions" />;
    case "invariants":
      return <ContextRecordList empty="No applicable invariants are included." records={asRecords(payload.invariants)} title="Invariants and acknowledgements" />;
    case "readiness":
      return readiness ? <div className="context-record-stack"><article className="context-record-card"><span className="mono-label">SAVED PLANNING EVALUATION</span><ContextRecordFields record={readiness} /></article><p className="context-disclaimer">Readiness describes planning rules only. It is not implementation, test, CI or release verification.</p></div> : <p className="context-empty">No saved readiness evaluation is included.</p>;
    case "git":
      return <div className="context-record-stack"><ContextRecordList empty="No Git observations are included. Planning-only context remains valid." records={asRecords(payload.git_observations)} title="Historical metadata observations" /><p className="context-disclaimer">Git observations are read-only metadata. An unavailable or historical observation is never presented as current verification.</p></div>;
    case "provenance":
      return <div className="context-provenance"><h4>What this snapshot represents</h4><ul><li>Planning fields are declared product context.</li><li>Git fields are observed metadata and may be historical or unavailable.</li><li>Preview does not create history; Generate &amp; save creates an immutable snapshot.</li><li>Local paths, remote URLs, credentials, source content and untracked names are excluded.</li><li>A clean observation does not prove tests passed or that a release is ready.</li></ul></div>;
  }
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

function packageDownloadUrl(workspaceId: string, projectId: string, featureId: string, packageId: string, format: "json" | "markdown") {
  return `/api/workspaces/${workspaceId}/projects/${projectId}/features/${featureId}/context/packages/${packageId}/download?format=${format}`;
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
    setPending("link"); setError(null); setNotice(null);
    try { await forgeApi.linkFeatureRepository(workspace.id, projectId, featureId, selected); setSelected(""); setNotice("Repository linked to this Feature."); await load(); }
    catch (cause) { setError(errorMessage(cause, "Could not link repository.")); }
    finally { setPending(null); }
  };
  const unlink = async (repositoryId: string) => {
    if (pending) return;
    setPending(`unlink:${repositoryId}`); setError(null); setNotice(null);
    try { await forgeApi.unlinkFeatureRepository(workspace.id, projectId, featureId, repositoryId); setNotice("Repository unlinked from this Feature."); await load(); }
    catch (cause) { setError(errorMessage(cause, "Could not unlink repository.")); }
    finally { setPending(null); }
  };
  const generate = async (kind: "preview" | "save") => {
    if (pending) return;
    setPending(kind); setError(null); setNotice(null);
    try {
      const next = kind === "preview" ? await forgeApi.previewContextPackage(workspace.id, projectId, featureId) : await forgeApi.saveContextPackage(workspace.id, projectId, featureId);
      setPreview(next);
      setNotice(kind === "preview" ? "Preview refreshed. No history was created." : "Immutable Context Package saved.");
      if (kind === "save") await load();
    } catch (cause) { setError(errorMessage(cause, "Could not build the context package.")); }
    finally { setPending(null); }
  };
  return <section className="detail-section context-package-section"><div className="section-heading"><div><span className="eyebrow accent">DETERMINISTIC CONTEXT</span><h2>Context package</h2></div><span className="status-chip neutral">{packages.length} saved</span></div><p className="planning-disclaimer">Review every exported section before saving. Planning is declared context; Git is read-only observed metadata and never delivery verification.</p>{error && <p className="status-error" role="alert">{error}</p>}{notice && <p aria-live="polite" className="status-message" role="status">{notice}</p>}{loading ? <LoadingPanel label="Loading context" /> : <><div className="context-links"><div><h3>Linked repositories</h3>{linked.length ? <ul className="dependency-list">{linked.map((item) => <li key={item.id}><span>{shortPath(item.root_path)}</span><button className="button ghost" disabled={pending !== null} onClick={() => void unlink(item.id)} type="button">{pending === `unlink:${item.id}` ? "Removing..." : "Unlink"}</button></li>)}</ul> : <p>No repositories linked to this Feature.</p>}</div><div className="inline-link-form"><label>Repository<select aria-label="Repository to link" onChange={(event) => setSelected(event.target.value)} value={selected}><option value="">Select connected repository</option>{available.map((item) => <option key={item.id} value={item.id}>{shortPath(item.root_path)}</option>)}</select></label><button className="button secondary" disabled={!selected || pending !== null} onClick={() => void link()} type="button">{pending === "link" ? "Linking..." : "Link"}</button></div></div><div className="detail-actions"><button className="button secondary" disabled={pending !== null} onClick={() => void generate("preview")} type="button">{pending === "preview" ? "Building..." : "Preview package"}</button><button className="button primary" disabled={pending !== null} onClick={() => void generate("save")} type="button">{pending === "save" ? "Saving..." : "Generate & save"}</button></div>{preview && <PackagePreview downloadBase={(id, format) => packageDownloadUrl(workspace.id, projectId, featureId, id, format)} packageData={preview} />}{packages.length ? <div className="context-history"><div className="section-heading"><h3>Saved package history</h3><span className="planning-disclaimer">Immutable snapshots · JSON and Markdown</span></div>{packages.map((item) => <div className="history-row" key={item.id}><span>{item.created_at ? new Date(item.created_at).toLocaleString() : "Preview"}</span><strong>{item.schema_version}</strong><span>{item.fingerprint.slice(0, 12)}</span>{item.id && <><a aria-label={`Download JSON ${item.fingerprint.slice(0, 12)}`} className="button ghost" href={packageDownloadUrl(workspace.id, projectId, featureId, item.id, "json")}>JSON</a><a aria-label={`Download Markdown ${item.fingerprint.slice(0, 12)}`} className="button ghost" href={packageDownloadUrl(workspace.id, projectId, featureId, item.id, "markdown")}>Markdown</a></>}</div>)}</div> : <div className="quiet-empty-row">No immutable packages saved yet. Preview does not create history.</div>}</>}</section>;
}

export function FeatureContextPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const { projectId, featureId } = useParams<{ projectId: string; featureId: string }>();
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="An immutable, deterministic planning snapshot for this Feature." title="Context package"><div className="planning-tabs"><Link className="detail-tab" to={`/projects/${projectId}/features/${featureId}`}>Feature detail</Link><Link className="detail-tab active" to={`/projects/${projectId}/features/${featureId}/context`}>Context</Link></div>{workspace && projectId && featureId ? <ContextPackageSection featureId={featureId} projectId={projectId} workspace={workspace} /> : <div className="empty-panel"><h2>Select a workspace</h2><p>Context packages are scoped to a Feature and Project.</p></div>}</PageFrame>;
}

function PackagePreview({ packageData, downloadBase }: { packageData: ContextPackage; downloadBase: (packageId: string, format: "json" | "markdown") => string }) {
  const [activeSection, setActiveSection] = useState<ContextSectionId>("overview");
  const payload = asRecord(packageData.payload);
  const readiness = payload.readiness ? asRecord(payload.readiness) : null;
  const observations = asRecords(payload.git_observations);
  const feature = asRecord(payload.feature);
  const saved = packageData.id !== null;
  return <div aria-label="Context package preview" className="context-preview-shell"><div className="context-preview-header"><div><span className="mono-label">{packageData.schema_version}</span><h3>Feature context overview</h3><div className="context-preview-tags"><span className="status-chip neutral">PLANNING DATA</span><span className="status-chip neutral">{observations.length ? "GIT METADATA" : "NO GIT OBSERVATION"}</span>{readiness && <span className={`status-chip ${readiness.outcome === "READY_TO_START" ? "active" : "archived"}`}>{String(readiness.outcome)}</span>}</div></div><div className="context-preview-actions">{saved ? <><a className="button ghost" href={downloadBase(packageData.id!, "json")}>Download JSON</a><a className="button ghost" href={downloadBase(packageData.id!, "markdown")}>Download Markdown</a></> : <span className="planning-disclaimer">Preview only · save to enable downloads</span>}<code title={packageData.fingerprint}>SHA-256 {packageData.fingerprint.slice(0, 16)}…</code></div></div><div className="context-preview-layout"><nav aria-label="Context package sections" className="context-preview-nav"><span className="mono-label">CONTENTS</span>{contextSections.map((item) => <button aria-current={activeSection === item.id ? "page" : undefined} className={activeSection === item.id ? "active" : ""} key={item.id} onClick={() => setActiveSection(item.id)} type="button">{item.label}</button>)}</nav><section aria-labelledby="context-preview-section-title" className="context-preview-content"><div className="context-preview-content-heading"><div><span className="mono-label">{String(feature.key ?? "FEATURE")} / {contextSections.find((item) => item.id === activeSection)?.label.toUpperCase()}</span><h4 id="context-preview-section-title">{contextSections.find((item) => item.id === activeSection)?.label}</h4></div><span className="context-fingerprint">{packageData.fingerprint.slice(0, 12)}…</span></div><ContextSectionContent payload={payload} section={activeSection} /></section></div><p className="context-preview-footnote">Preview does not create history. Local paths and source content are excluded.</p></div>;
}
