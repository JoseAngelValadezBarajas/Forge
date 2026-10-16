/* API-loading effects synchronize external SQLite-backed state and are guarded by AbortController. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  forgeApi,
  type AgentRun,
  type ContextPackage,
  type Feature,
  type Handoff,
  type HandoffRevision,
  type HandoffStatus,
  type Project,
  type RunEvent,
  type RunOutputReference,
  type RunStatus,
  type Workspace,
} from "./api";
import { PageFrame } from "./shared/ui/PageFrame";
import { formatDate } from "./shared/utils/formatDate";

type PaletteOpener = (button: HTMLButtonElement) => void;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function StatusChip({ status }: { status: string }) {
  return <span className={`status-chip fnd05-status ${status.toLowerCase()}`}>{status.replaceAll("_", " ")}</span>;
}

function Loading({ label = "Loading recorded context…" }: { label?: string }) {
  return <div className="fnd05-feedback" role="status"><span className="spinner" />{label}</div>;
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="feedback-panel error-panel" role="alert"><span>{message}</span>{onRetry && <button className="button secondary" onClick={onRetry} type="button">Retry</button>}</div>;
}

function ProvenanceBanner({ children = "Reported manually · observed and verified evidence are not available in FND-05." }: { children?: string }) {
  return <aside className="fnd05-provenance"><span className="eyebrow accent">REPORTING BOUNDARY</span><p>{children}</p></aside>;
}

export function WorkbenchPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspace) { setRuns([]); setHandoffs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [runItems, projects] = await Promise.all([
        forgeApi.listRuns(workspace.id, {}, controller.signal),
        forgeApi.listProjects(workspace.id, "", "all", controller.signal),
      ]);
      const handoffLists = await Promise.all(projects.map((project) => forgeApi.listHandoffs(workspace.id, project.id, {}, controller.signal)));
      if (!controller.signal.aborted) { setRuns(runItems); setHandoffs(handoffLists.flat()); setError(null); }
    } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load the Workbench.")); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [workspace]);
  useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [load]);
  const activeRuns = runs.filter((item) => !["COMPLETED", "FAILED", "CANCELLED"].includes(item.status)).length;
  const readyHandoffs = handoffs.filter((item) => item.status === "READY").length;
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="A durable place for human-reported work, pinned context and handoffs." title="Workbench">
    {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={() => void load()} /> : <>
      <div className="metric-grid"><Metric label="Recorded runs" value={runs.length} detail="Human-reported" /><Metric label="Active records" value={activeRuns} detail="Not process telemetry" /><Metric label="Handoffs ready" value={readyHandoffs} detail="Awaiting review" /><Metric label="Context snapshots" value={new Set(runs.map((item) => item.context_package_id)).size} detail="Immutable inputs" /></div>
      <div className="fnd05-grid">
        <section className="fnd05-panel"><div className="section-heading"><div><span className="eyebrow">RECENT RUN ACTIVITY</span><h2>Recorded runs</h2></div><Link className="button primary" to="/workbench/runs/new">+ Record run</Link></div>{runs.length ? <div className="fnd05-stack">{runs.slice(0, 5).map((run) => <Link className="fnd05-card" key={run.id} to={`/projects/${run.project_id}/runs/${run.id}`}><div><span className="mono-label">{run.id.slice(0, 8).toUpperCase()}</span><h3>{run.title}</h3><p>Feature {run.feature_id.slice(0, 8)} · updated {formatDate(run.updated_at)}</p></div><StatusChip status={run.status} /></Link>)}</div> : <EmptyWorkbench />}</section>
        <aside className="fnd05-side-stack"><section className="fnd05-panel"><span className="eyebrow">HANDOFFS AWAITING REVIEW</span><strong className="fnd05-big-number">{readyHandoffs}</strong><p>Each handoff captures what was reported, what remains and which context follows.</p><Link className="button secondary" to="/workbench/handoffs">Open handoffs →</Link></section><ProvenanceBanner /></aside>
      </div>
      <section className="fnd05-panel fnd05-flow"><span className="eyebrow accent">FEATURE RELATIONSHIP</span><h2>From Feature to recorded execution</h2><p>Feature → immutable Context Package → Run → reported events → Handoff → later verification.</p></section>
    </>}
  </PageFrame>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="metric-card"><span className="eyebrow">{label}</span><strong>{value}</strong><span>{detail}</span></div>;
}

function EmptyWorkbench() {
  return <section className="fnd05-empty"><span className="empty-orbit" aria-hidden="true">F</span><span className="eyebrow accent">NO RUNS RECORDED YET</span><h2>Start with a known Feature</h2><p>Select a saved Context Package, then record progress without starting an agent or reading conversations automatically.</p><div className="form-actions"><Link className="button primary" to="/workbench/runs/new">Record first run</Link><Link className="button secondary" to="/projects">Explore Features</Link></div></section>;
}

export function RunInventoryPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("project") ?? undefined;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RunStatus | "">("");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
    if (!workspace) { setRuns([]); setLoading(false); return; }
    setLoading(true);
    try { const result = await forgeApi.listRuns(workspace.id, { projectId, search, status: status || undefined }, controller.signal); if (!controller.signal.aborted) { setRuns(result); setError(null); } }
    catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load runs.")); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [projectId, search, status, workspace]);
  useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [load]);
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Provider-neutral records with immutable planning inputs." title="Agent Runs">
    <div className="section-heading fnd05-toolbar"><div><span className="eyebrow accent">WORKBENCH / RUNS</span><p>Records describe reported work; they do not prove delivery.</p></div><Link className="button primary" to="/workbench/runs/new">+ New run</Link></div>
    <section className="fnd05-filters"><label>Search runs<input aria-label="Search runs" onChange={(event) => setSearch(event.target.value)} placeholder="Search titles" value={search} /></label><label>Status<select aria-label="Run status" onChange={(event) => setStatus(event.target.value as RunStatus | "")} value={status}><option value="">All recorded states</option>{["PLANNED", "IN_PROGRESS", "AWAITING_HANDOFF", "COMPLETED", "FAILED", "CANCELLED"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label></section>
    {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={() => void load()} /> : <section className="fnd05-panel"><div className="section-heading"><div><span className="eyebrow">RUN INVENTORY</span><h2>Recorded runs</h2></div><span className="mono-label">{runs.length} records</span></div>{runs.length ? <div className="fnd05-stack">{runs.map((run) => <Link className="fnd05-card" key={run.id} to={`/projects/${run.project_id}/runs/${run.id}`}><div><span className="mono-label">{run.id}</span><h3>{run.title}</h3><p>{run.context_schema_version} · {run.context_fingerprint.slice(0, 12)}… · Feature {run.feature_id.slice(0, 8)}</p></div><StatusChip status={run.status} /></Link>)}</div> : <div className="quiet-empty-row"><span className="mono-label">EMPTY</span><span>No recorded runs match this view.</span></div>}</section>}
    {projectId && <button className="button ghost" onClick={() => setSearchParams({})} type="button">Clear project filter</button>}
  </PageFrame>;
}

export function RunCreatePage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const navigate = useNavigate(); const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]); const [features, setFeatures] = useState<Feature[]>([]); const [packages, setPackages] = useState<ContextPackage[]>([]);
  const [projectId, setProjectId] = useState(searchParams.get("project") ?? ""); const [featureId, setFeatureId] = useState(searchParams.get("feature") ?? ""); const [packageId, setPackageId] = useState(""); const [title, setTitle] = useState(""); const [executorLabel, setExecutorLabel] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!workspace) return; const controller = new AbortController(); void forgeApi.listProjects(workspace.id, "", "active", controller.signal).then((items) => { setProjects(items); if (!projectId && items[0]) setProjectId(items[0].id); }).catch((cause) => { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load projects.")); }); return () => controller.abort(); }, [projectId, workspace]);
  useEffect(() => { if (!workspace || !projectId) { setFeatures([]); return; } const controller = new AbortController(); void forgeApi.listFeatures(workspace.id, projectId, {}, controller.signal).then((items) => { setFeatures(items); if (!items.some((item) => item.id === featureId)) setFeatureId(items[0]?.id ?? ""); }).catch((cause) => { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load features.")); }); return () => controller.abort(); }, [featureId, projectId, workspace]);
  useEffect(() => { if (!workspace || !projectId || !featureId) { setPackages([]); return; } const controller = new AbortController(); void forgeApi.listContextPackages(workspace.id, projectId, featureId, controller.signal).then((items) => { setPackages(items); setPackageId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? ""); }).catch((cause) => { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load Context Packages.")); }); return () => controller.abort(); }, [featureId, projectId, workspace]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!workspace || !projectId || !featureId || !packageId || !title.trim()) { setError("Choose a Feature, a saved Context Package and a run title."); return; } setSaving(true); setError(null); try { const run = await forgeApi.createRun(workspace.id, projectId, { feature_id: featureId, context_package_id: packageId, title: title.trim(), executor_label: executorLabel.trim() || undefined }); navigate(`/projects/${projectId}/runs/${run.id}`); } catch (cause) { setError(errorMessage(cause, "Could not record the run.")); } finally { setSaving(false); } };
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Explicitly document a human or agent-assisted work session; no execution is launched." title="Record a New Run"><div className="fnd05-stepper">01 Scope &amp; context <span>→</span> 02 Run details <span>→</span> 03 Review &amp; record</div>{error && <ErrorBox message={error} />}<form className="fnd05-form" onSubmit={submit}><div className="fnd05-panel"><span className="eyebrow accent">KNOWN FEATURE</span><h2>Start with a known Feature</h2><p>Select a saved Context Package as the exact input for this record.</p><label>Project<select aria-label="Project" onChange={(event) => { setProjectId(event.target.value); setFeatureId(""); setPackageId(""); }} value={projectId}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Feature<select aria-label="Feature" disabled={!features.length} onChange={(event) => { setFeatureId(event.target.value); setPackageId(""); }} value={featureId}>{features.map((item) => <option key={item.id} value={item.id}>{item.key} · {item.title}</option>)}</select></label><label>Context Package<select aria-label="Context Package" disabled={!packages.length} onChange={(event) => setPackageId(event.target.value)} value={packageId}>{packages.map((item) => <option key={item.id ?? "package"} value={item.id ?? ""}>{item.schema_version} / {item.fingerprint.slice(0, 16)}…</option>)}</select></label><div className="fnd05-callout"><span className="eyebrow">IMMUTABLE INPUT</span><p>{packages.length ? "The run will always reference this saved fingerprint." : "Save a Context Package from Feature Context before recording a run."}</p></div><label>Run title<input aria-label="Run title" maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Implement workspace export" value={title} /></label><label>Executor label <span className="field-hint">Optional</span><input aria-label="Executor label" onChange={(event) => setExecutorLabel(event.target.value)} placeholder="Human / External tool" value={executorLabel} /></label><div className="form-actions"><Link className="button secondary" to="/workbench">Cancel</Link><button className="button primary" disabled={saving || !packages.length} type="submit">{saving ? "Recording…" : "Record run →"}</button></div></div><aside className="fnd05-panel fnd05-guidance"><h2>What this does</h2><p>Records intent, provenance and the exact planning context used.</p><hr /><h3>It does not</h3><ul><li>Start an agent or local process.</li><li>Read chats from another app.</li><li>Validate work or CI results.</li></ul><StatusChip status="MANUAL REPORT" /></aside></form></PageFrame>;
}

export function RunDetailPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const { projectId = "", runId = "" } = useParams<{ projectId: string; runId: string }>(); const navigate = useNavigate();
  const [run, setRun] = useState<AgentRun | null>(null); const [events, setEvents] = useState<RunEvent[]>([]); const [outputs, setOutputs] = useState<RunOutputReference[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [eventOpen, setEventOpen] = useState(false); const [eventTitle, setEventTitle] = useState(""); const [eventDescription, setEventDescription] = useState(""); const [eventType, setEventType] = useState("progress"); const [outputOpen, setOutputOpen] = useState(false); const [outputLabel, setOutputLabel] = useState(""); const [outputSummary, setOutputSummary] = useState(""); const [outputProvenance, setOutputProvenance] = useState(""); const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => { if (!workspace || !projectId || !runId) return; controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller; setLoading(true); try { const [item, timeline, reportedOutputs] = await Promise.all([forgeApi.getRun(workspace.id, projectId, runId, controller.signal), forgeApi.listRunEvents(workspace.id, projectId, runId, controller.signal), forgeApi.listRunOutputs(workspace.id, projectId, runId, controller.signal)]); if (!controller.signal.aborted) { setRun(item); setEvents(timeline); setOutputs(reportedOutputs); setError(null); } } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load this run.")); } finally { if (!controller.signal.aborted) setLoading(false); } }, [projectId, runId, workspace]);
  useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [load]);
  const action = async (work: () => Promise<unknown>) => { setPending(true); setError(null); try { await work(); await load(); } catch (cause) { setError(errorMessage(cause, "Could not update this run.")); } finally { setPending(false); } };
  const submitEvent = async (event: FormEvent) => { event.preventDefault(); if (!run) return; await action(async () => { await forgeApi.addRunEvent(workspace!.id, projectId, run.id, { event_type: eventType, title: eventTitle, description: eventDescription, expected_version: run.version }); setEventTitle(""); setEventDescription(""); setEventOpen(false); }); };
  const submitOutput = async (event: FormEvent) => { event.preventDefault(); if (!run) return; await action(async () => { await forgeApi.addRunOutput(workspace!.id, projectId, run.id, { label: outputLabel, summary: outputSummary, provenance: outputProvenance, expected_version: run.version }); setOutputLabel(""); setOutputSummary(""); setOutputProvenance(""); setOutputOpen(false); }); };
  const prepareHandoff = async () => { if (!run) return; setPending(true); setError(null); try { const handoff = await forgeApi.createHandoff(workspace!.id, projectId, run.id, { title: `Next step for ${run.title}`, summary: "", outcomes: "", blockers: "", questions: "", next_actions: "", references: "" }); navigate(`/projects/${projectId}/handoffs/${handoff.id}`); } catch (cause) { setError(errorMessage(cause, "Could not prepare the handoff.")); } finally { setPending(false); } };
  if (loading) return <PageFrame onOpenPalette={onOpenPalette} subtitle="Loading durable reported context." title="Run Detail & Timeline"><Loading /></PageFrame>;
  if (error && !run) return <PageFrame onOpenPalette={onOpenPalette} subtitle="The record could not be loaded." title="Run Detail & Timeline"><ErrorBox message={error} onRetry={() => void load()} /></PageFrame>;
  if (!run) return null;
  const nextStates: RunStatus[] = run.status === "PLANNED" ? ["IN_PROGRESS", "CANCELLED"] : run.status === "IN_PROGRESS" ? ["AWAITING_HANDOFF", "COMPLETED", "FAILED", "CANCELLED"] : run.status === "AWAITING_HANDOFF" ? ["COMPLETED", "FAILED", "CANCELLED"] : [];
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="A durable account of the context received and the work actually reported." title="Run Detail & Timeline"><div className="fnd05-detail-toolbar"><StatusChip status={run.status} /><div className="form-actions">{nextStates.slice(0, 1).map((state) => <button className="button secondary" disabled={pending} key={state} onClick={() => void action(() => forgeApi.updateRunStatus(workspace!.id, projectId, run.id, state, run.version))} type="button">Move to {state.replaceAll("_", " ")}</button>)}<button className="button secondary" disabled={pending} onClick={() => setEventOpen((value) => !value)} type="button">+ Add event</button><button className="button secondary" disabled={pending} onClick={() => setOutputOpen((value) => !value)} type="button">+ Add output</button><button className="button primary" disabled={pending} onClick={() => void prepareHandoff()} type="button">Prepare handoff</button></div></div>{error && <ErrorBox message={error} />}<section className="fnd05-panel fnd05-run-identity"><span className="eyebrow accent">RUN RECORD</span><h2>{run.title}</h2><p>Feature {run.feature_id} · Recorded manually · {run.started_at ? `Started ${formatDate(run.started_at)}` : "Not started"}</p><hr /><p className="fnd05-fingerprint">Context: {run.context_schema_version} · SHA-256 {run.context_fingerprint.slice(0, 16)}…</p></section>{eventOpen && <form className="fnd05-panel fnd05-event-form" onSubmit={submitEvent}><div className="section-heading"><h2>Report activity</h2><button className="icon-button" onClick={() => setEventOpen(false)} type="button" aria-label="Close activity form">×</button></div><label>Type<select aria-label="Event type" onChange={(event) => setEventType(event.target.value)} value={eventType}><option value="progress">Progress</option><option value="blocker">Blocker</option><option value="decision_note">Decision note</option><option value="general_note">General note</option></select></label><label>Title<input aria-label="Event title" onChange={(event) => setEventTitle(event.target.value)} value={eventTitle} /></label><label>Description<textarea aria-label="Event description" onChange={(event) => setEventDescription(event.target.value)} rows={4} value={eventDescription} /></label><button className="button primary" disabled={pending} type="submit">Report event</button></form>}{outputOpen && <form className="fnd05-panel fnd05-event-form" onSubmit={submitOutput}><div className="section-heading"><h2>Report an output</h2><button className="icon-button" onClick={() => setOutputOpen(false)} type="button" aria-label="Close output form">×</button></div><label>Label<input aria-label="Output label" onChange={(event) => setOutputLabel(event.target.value)} value={outputLabel} /></label><label>Summary<textarea aria-label="Output summary" onChange={(event) => setOutputSummary(event.target.value)} rows={3} value={outputSummary} /></label><label>Provenance<textarea aria-label="Output provenance" onChange={(event) => setOutputProvenance(event.target.value)} rows={3} value={outputProvenance} /></label><p className="planning-disclaimer">This is a declared reference. Forge does not open or verify local files, commits or external content.</p><button className="button primary" disabled={pending} type="submit">Report output</button></form>}<div className="fnd05-detail-grid"><section className="fnd05-panel"><div className="section-heading"><div><span className="eyebrow">APPEND-ONLY REPORTED TIMELINE</span><h2>Activity timeline</h2></div><span className="mono-label">{events.length} events</span></div><p className="planning-disclaimer">Events are reported by a person; timestamps are not CI evidence.</p><div className="fnd05-stack">{events.map((item) => <article className="fnd05-event" key={item.id}><span className="fnd05-event-time">{formatDate(item.recorded_at)}</span><div><h3>{item.title}</h3><p>{item.description}</p>{item.supersedes_event_id && <span className="mono-label">Correction of {item.supersedes_event_id.slice(0, 8)}</span>}</div></article>)}</div></section><aside className="fnd05-side-stack"><section className="fnd05-panel"><span className="eyebrow">RUN LIFECYCLE</span><p>{run.status.replaceAll("_", " ")}</p><p className="planning-disclaimer">Next transitions are explicit and terminal states cannot silently revert.</p></section><section className="fnd05-panel"><span className="eyebrow">REPORTED OUTPUTS</span>{outputs.length ? <div className="fnd05-stack">{outputs.map((item) => <article className="fnd05-output" key={item.id}><strong>{item.label}</strong><p>{item.summary}</p><span className="mono-label">{item.provenance}</span></article>)}</div> : <p className="planning-disclaimer">No reported outputs yet.</p>}</section></aside></div><ProvenanceBanner /></PageFrame>;
}

export function HandoffQueuePage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const [projects, setProjects] = useState<Project[]>([]); const [projectId, setProjectId] = useState(""); const [status, setStatus] = useState<HandoffStatus | "">(""); const [handoffs, setHandoffs] = useState<Handoff[]>([]); const [loading, setLoading] = useState(Boolean(workspace)); const [error, setError] = useState<string | null>(null); const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => { if (!workspace) return; const controller = new AbortController(); void forgeApi.listProjects(workspace.id, "", "all", controller.signal).then((items) => { setProjects(items); setProjectId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? ""); }).catch((cause) => { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load projects.")); }); return () => controller.abort(); }, [workspace]);
  const load = useCallback(async () => { if (!workspace || !projectId) { setHandoffs([]); setLoading(false); return; } controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller; setLoading(true); try { const items = await forgeApi.listHandoffs(workspace.id, projectId, { status: status || undefined }, controller.signal); if (!controller.signal.aborted) { setHandoffs(items); setError(null); } } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load handoffs.")); } finally { if (!controller.signal.aborted) setLoading(false); } }, [projectId, status, workspace]);
  useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [load]);
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Draft, ready and acknowledged handoffs with human-visible provenance." title="Handoff Queue"><div className="section-heading fnd05-toolbar"><div><span className="eyebrow accent">WORKBENCH / HANDOFFS</span><p>A ready handoff is prepared for review, not received by an external agent.</p></div><Link className="button primary" to="/workbench/runs/new">+ New handoff from a run</Link></div><section className="fnd05-filters"><label>Project<select aria-label="Handoff project" onChange={(event) => setProjectId(event.target.value)} value={projectId}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Status<select aria-label="Handoff status" onChange={(event) => setStatus(event.target.value as HandoffStatus | "")} value={status}><option value="">All handoff states</option>{["DRAFT", "READY", "ACKNOWLEDGED", "WITHDRAWN"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label></section>{loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={() => void load()} /> : <section className="fnd05-panel"><div className="section-heading"><div><span className="eyebrow">HANDOFF INBOX</span><h2>Handoffs</h2></div><span className="mono-label">{handoffs.length} records</span></div>{handoffs.length ? <div className="fnd05-stack">{handoffs.map((item) => <Link className="fnd05-card" key={item.id} to={`/projects/${item.project_id}/handoffs/${item.id}`}><div><span className="mono-label">{item.id}</span><h3>{item.title}</h3><p>Run {item.run_id.slice(0, 8)} · Feature {item.feature_id.slice(0, 8)}</p></div><StatusChip status={item.status} /></Link>)}</div> : <div className="quiet-empty-row"><span className="mono-label">EMPTY</span><span>No handoffs are recorded for this project.</span></div>}</section>}<ProvenanceBanner /></PageFrame>;
}

export function HandoffDetailPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const { projectId = "", handoffId = "" } = useParams<{ projectId: string; handoffId: string }>();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [revisions, setRevisions] = useState<HandoffRevision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ title: "", summary: "", outcomes: "", blockers: "", questions: "", next_actions: "", references: "" });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const [item, published] = await Promise.all([
        forgeApi.getHandoff(workspace.id, projectId, handoffId, controller.signal),
        forgeApi.listHandoffRevisions(workspace.id, projectId, handoffId, controller.signal),
      ]);
      if (!controller.signal.aborted) {
        setHandoff(item);
        setRevisions(published);
        setSelectedRevision(item.current_revision || null);
        setForm({ title: item.title, summary: item.summary, outcomes: item.outcomes, blockers: item.blockers, questions: item.questions, next_actions: item.next_actions, references: item.references });
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load this handoff."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [handoffId, projectId, workspace]);

  useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || !handoff || handoff.status !== "DRAFT") return;
    setPending(true);
    setError(null);
    try {
      const updated = await forgeApi.updateHandoff(workspace.id, projectId, handoff.id, { ...form, expected_version: handoff.version });
      setHandoff(updated);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save the draft."));
    } finally {
      setPending(false);
    }
  };

  const transition = async (work: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not update this handoff."));
    } finally {
      setPending(false);
    }
  };

  if (!workspace) return <PageFrame onOpenPalette={onOpenPalette} subtitle="Select a workspace to review handoffs." title="Handoff Review & Acknowledge"><Loading /></PageFrame>;
  const activeWorkspace = workspace;
  if (loading) return <PageFrame onOpenPalette={onOpenPalette} subtitle="Loading reviewable context." title="Handoff Review & Acknowledge"><Loading /></PageFrame>;
  if (!handoff) return <PageFrame onOpenPalette={onOpenPalette} subtitle="The handoff could not be loaded." title="Handoff Review & Acknowledge"><ErrorBox message={error ?? "Handoff not found."} onRetry={() => void load()} /></PageFrame>;

  const selected = revisions.find((revision) => revision.revision === selectedRevision) ?? handoff.published_revision;
  const currentPublished = revisions.find((revision) => revision.revision === handoff.current_revision) ?? handoff.published_revision;
  const selectedAcknowledgement = (handoff.acknowledgements ?? []).find((item) => item.revision === selected?.revision);
  const canAcknowledge = handoff.status === "READY" && selected?.revision === handoff.current_revision;
  const downloadBase = selected ? `/api/workspaces/${activeWorkspace.id}/projects/${projectId}/handoffs/${handoff.id}/revisions/${selected.revision}/download` : "";

  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Receive the report, context and unresolved questions in one inspectable place." title="Handoff Review & Acknowledge">
    <div className="fnd05-detail-toolbar"><StatusChip status={handoff.status} /><div className="form-actions">
      <Link className="button secondary" to={`/projects/${projectId}/runs/${handoff.run_id}`}>Source run</Link>
      {selected && <><a aria-label={`Download revision ${selected.revision} as JSON`} className="button secondary" download href={`${downloadBase}?format=json`}>Export JSON</a><a aria-label={`Download revision ${selected.revision} as Markdown`} className="button secondary" download href={`${downloadBase}?format=markdown`}>Export Markdown</a></>}
      {canAcknowledge && <button className="button primary" disabled={pending} onClick={() => void transition(() => forgeApi.acknowledgeHandoff(activeWorkspace.id, projectId, handoff.id, handoff.current_revision, "manual reviewer"))} type="button">Acknowledge</button>}
      {handoff.status === "ACKNOWLEDGED" && <button className="button secondary" disabled={pending} onClick={() => void transition(() => forgeApi.reviseHandoff(activeWorkspace.id, projectId, handoff.id, handoff.version))} type="button">Create correction draft</button>}
    </div></div>
    {error && <ErrorBox message={error} />}
    <section className="fnd05-panel fnd05-handoff-source"><span className="eyebrow accent">SOURCE RUN</span><h2>{handoff.title}</h2><p>Run {handoff.run_id} · Pinned Context Package {handoff.context_package_id}</p>{currentPublished && <p className="fnd05-fingerprint">{currentPublished.schema_version} · SHA-256 {currentPublished.fingerprint.slice(0, 16)}…</p>}</section>
    {handoff.status === "DRAFT" ? <form className="fnd05-panel fnd05-handoff-form" onSubmit={save}>
      <div className="section-heading"><div><span className="eyebrow">HANDOFF DRAFT</span><h2>What should the next person know?</h2></div><span className="status-chip neutral">MANUALLY AUTHORED</span></div>
      {(["title", "summary", "outcomes", "blockers", "questions", "next_actions", "references"] as const).map((field) => <label key={field}>{field.replaceAll("_", " ")} {field === "title" ? <input aria-label={field} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} value={form[field]} /> : <textarea aria-label={field} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} rows={field === "summary" ? 3 : 2} value={form[field]} />}</label>)}
      <p className="planning-disclaimer">The receiving person must review this handoff. No automatic acknowledgement occurs.</p><div className="form-actions"><button className="button secondary" disabled={pending} type="submit">{pending ? "Saving…" : "Save draft"}</button><button className="button primary" disabled={pending} onClick={(event) => { event.preventDefault(); void transition(async () => { const updated = await forgeApi.updateHandoff(activeWorkspace.id, projectId, handoff.id, { ...form, expected_version: handoff.version }); await forgeApi.readyHandoff(activeWorkspace.id, projectId, handoff.id, updated.version); }); }} type="button">Mark ready</button></div>
    </form> : <div className="fnd05-detail-grid"><section className="fnd05-panel fnd05-report"><span className="eyebrow">WHAT WAS REPORTED</span><h2>{selected?.summary || "No summary was reported."}</h2><ReportField label="Reported outcomes" value={selected?.outcomes ?? handoff.outcomes} /><ReportField label="Blockers & uncertainty" value={selected?.blockers ?? handoff.blockers} /><ReportField label="Open questions" value={selected?.questions ?? handoff.questions} /><ReportField label="Recommended next actions" value={selected?.next_actions ?? handoff.next_actions} /><ReportField label="References" value={selected?.references ?? handoff.references} /></section><aside className="fnd05-side-stack"><section className="fnd05-panel"><h2>What acknowledgement means</h2><p>I read this handoff and accepted responsibility for further review.</p><p className="status-error">It does NOT certify implementation, testing or delivery correctness.</p></section><section className="fnd05-panel"><span className="eyebrow">AUDIT TRAIL</span><p>Draft created · {formatDate(handoff.created_at)}</p><p>{handoff.ready_at ? `Marked ready · ${formatDate(handoff.ready_at)}` : "Not marked ready"}</p><p>{handoff.acknowledged_at ? `Acknowledged · ${formatDate(handoff.acknowledged_at)}` : "Awaiting acknowledgement"}</p>{handoff.status === "READY" && !handoff.acknowledgement && <p className="status-warning">Current revision is ready and awaits acknowledgement.</p>}</section></aside></div>}
    <section className="fnd05-panel"><div className="section-heading"><div><span className="eyebrow">IMMUTABLE HISTORY</span><h2>Published revisions</h2></div><span className="mono-label">{revisions.length} revisions</span></div>
      {handoff.status === "DRAFT" && <p className="planning-disclaimer">The editable draft above is not a published revision. Published snapshots below remain immutable.</p>}
      {revisions.length ? <div className="fnd05-revision-history"><nav aria-label="Published handoff revisions" className="fnd05-revision-list">{revisions.map((revision) => { const acknowledgement = (handoff.acknowledgements ?? []).find((item) => item.revision === revision.revision); return <button aria-pressed={selected?.revision === revision.revision} className={`fnd05-revision-choice${selected?.revision === revision.revision ? " selected" : ""}`} key={revision.id} onClick={() => setSelectedRevision(revision.revision)} type="button"><strong>Revision {revision.revision}{revision.revision === handoff.current_revision ? " · Current" : ""}</strong><span>{formatDate(revision.created_at)}</span><span>{revision.fingerprint.slice(0, 16)}…</span><span>{acknowledgement ? `Acknowledged · ${formatDate(acknowledgement.acknowledged_at)}` : "Not acknowledged"}</span></button>; })}</nav>{selected && <article className="fnd05-revision"><strong>Revision {selected.revision}{selected.revision === handoff.current_revision ? " · Current published" : " · Historical"}</strong><span>{selected.fingerprint}</span>{selectedAcknowledgement ? <span className="status-success">Acknowledged by {selectedAcknowledgement.acknowledged_by ?? "reviewer"} · {formatDate(selectedAcknowledgement.acknowledged_at)}</span> : <span className="status-warning">No acknowledgement recorded for this revision.</span>}<h3>{selected.title}</h3><ReportField label="Summary" value={selected.summary} /><ReportField label="Next actions" value={selected.next_actions} /><pre>{selected.markdown}</pre></article>}</div> : <p className="planning-disclaimer">No published revision exists until the draft is marked ready.</p>}
    </section><ProvenanceBanner />
  </PageFrame>;
}

function ReportField({ label, value }: { label: string; value: string }) {
  return <div className="fnd05-report-field"><span className="eyebrow">{label}</span><p>{value || "Nothing reported."}</p></div>;
}
