import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  forgeApi,
  type AcceptanceCriterion,
  type Epic,
  type Feature,
  type FeatureDependency,
  type FeaturePriority,
  type FeatureStatus,
  type ProjectPlanningOverview,
  type Task,
  type TaskStatus,
  type Workspace,
} from "./api";
import { ErrorPanel, LoadingPanel, PageFrame } from "./pages";

const statuses: FeatureStatus[] = ["backlog", "refining", "ready", "in_progress", "verify", "done"];
const priorities: FeaturePriority[] = ["low", "medium", "high", "critical"];

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type PlanningData = {
  overview: ProjectPlanningOverview;
  epics: Epic[];
  features: Feature[];
  dependencies: FeatureDependency[];
};

function usePlanningData(workspace: Workspace | null, projectId: string | undefined, search = "", priority?: FeaturePriority) {
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(Boolean(workspace && projectId));
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspace || !projectId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const [overview, epics, features, dependencies] = await Promise.all([
        forgeApi.getPlanningOverview(workspace.id, projectId, controller.signal),
        forgeApi.listEpics(workspace.id, projectId, controller.signal),
        forgeApi.listFeatures(workspace.id, projectId, { search, priority }, controller.signal),
        forgeApi.listDependencies(workspace.id, projectId, controller.signal),
      ]);
      if (currentRequest !== requestId.current) return;
      setData({ overview, epics, features, dependencies });
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || currentRequest !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load planning data.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [priority, projectId, search, workspace]);
  // The request synchronizes this page with the selected project and filters.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
    };
  }, [reload]);
  return { data, loading, error, reload };
}

export function ProjectBoardPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: (button: HTMLButtonElement) => void }) {
  return <PlanningPage mode="board" onOpenPalette={onOpenPalette} workspace={workspace} />;
}

export function FeaturesPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: (button: HTMLButtonElement) => void }) {
  return <PlanningPage mode="features" onOpenPalette={onOpenPalette} workspace={workspace} />;
}

function PlanningPage({ workspace, onOpenPalette, mode }: { workspace: Workspace | null; onOpenPalette: (button: HTMLButtonElement) => void; mode: "board" | "features" }) {
  const { projectId } = useParams<{ projectId: string }>();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<FeaturePriority | undefined>();
  const [createFeatureOpen, setCreateFeatureOpen] = useState(false);
  const [createEpicOpen, setCreateEpicOpen] = useState(false);
  const { data, loading, error, reload } = usePlanningData(workspace, projectId, search, priority);
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);

  const createFeature = async (payload: { title: string; description: string; goal: string; priority: FeaturePriority; status: FeatureStatus; epic_id?: string }) => {
    if (!workspace || !projectId) return;
    try {
      const feature = await forgeApi.createFeature(workspace.id, projectId, payload);
      setCreateFeatureOpen(false);
      await reload();
      navigate(`/projects/${projectId}/features/${feature.id}`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not create feature.");
    }
  };
  const createEpic = async (title: string, description: string) => {
    if (!workspace || !projectId) return;
    try {
      await forgeApi.createEpic(workspace.id, projectId, { title, description });
      setCreateEpicOpen(false);
      await reload();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not create epic.");
    }
  };
  const updateStatus = async (feature: Feature, nextStatus: FeatureStatus) => {
    if (!workspace || !projectId || feature.status === nextStatus) return;
    try {
      await forgeApi.updateFeature(workspace.id, projectId, feature.id, { status: nextStatus });
      await reload();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not update feature.");
    }
  };

  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Manual planning state only. Verification and delivery evidence are separate milestones." title={mode === "board" ? "Project Board" : "Features & Epics"}>
    <div className="planning-toolbar">
      <div className="planning-tabs" role="tablist" aria-label="Project planning views">
        <Link className={mode === "board" ? "detail-tab active" : "detail-tab"} to={`/projects/${projectId}/board`}>Board</Link>
        <Link className={mode === "features" ? "detail-tab active" : "detail-tab"} to={`/projects/${projectId}/features`}>Features</Link>
        <Link className="detail-tab" to={`/projects/${projectId}`}>Overview</Link>
      </div>
      <div className="planning-actions"><button className="button secondary" onClick={() => setCreateEpicOpen(true)} type="button">+ Epic</button><button className="button primary" onClick={() => setCreateFeatureOpen(true)} type="button">+ Feature</button></div>
    </div>
    <section className="planning-filters" aria-label="Feature filters">
      <label className="search-field">Search features<input aria-label="Search features" onChange={(event) => setSearch(event.target.value)} placeholder="Search title, goal or description" value={search} /></label>
      <label className="filter-field">Priority<select aria-label="Feature priority" onChange={(event) => setPriority(event.target.value ? event.target.value as FeaturePriority : undefined)} value={priority ?? ""}><option value="">All priorities</option>{priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
    </section>
    {actionError && <div className="feedback-panel error-panel" role="alert"><span>{actionError}</span><button className="button ghost" onClick={() => setActionError(null)} type="button">Dismiss</button></div>}
    {createFeatureOpen && <FeatureCreateForm epics={data?.epics ?? []} onCancel={() => setCreateFeatureOpen(false)} onSubmit={createFeature} />}
    {createEpicOpen && <EpicCreateForm onCancel={() => setCreateEpicOpen(false)} onSubmit={createEpic} />}
    {loading ? <LoadingPanel label="Loading planning data" /> : error ? <ErrorPanel message={error} onRetry={() => void reload()} /> : data ? mode === "board" ? <Board features={data.features} onStatusChange={updateStatus} /> : <FeatureInventory data={data} onStatusChange={updateStatus} /> : null}
  </PageFrame>;
}

function Board({ features, onStatusChange }: { features: Feature[]; onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<void> }) {
  return <section className="kanban-board" aria-label="Feature workflow board">{statuses.map((status) => <div className={`kanban-column status-${status}`} key={status}><div className="kanban-heading"><h2>{label(status)}</h2><span>{features.filter((feature) => feature.status === status).length}</span></div><div className="kanban-cards">{features.filter((feature) => feature.status === status).map((feature) => <FeatureCard feature={feature} key={feature.id} onStatusChange={onStatusChange} />)}{features.every((feature) => feature.status !== status) && <p className="kanban-empty">No features here yet.</p>}</div></div>)}</section>;
}

function FeatureCard({ feature, onStatusChange }: { feature: Feature; onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const nextStatus = statuses[(statuses.indexOf(feature.status) + 1) % statuses.length];
  const move = async () => {
    setSaving(true);
    try { await onStatusChange(feature, nextStatus); } finally { setSaving(false); }
  };
  return <article className="feature-card"><Link className="feature-card-link" to={`/projects/${feature.project_id}/features/${feature.id}`}><span className="mono-label">{feature.key}</span><h3>{feature.title}</h3><div className="feature-card-meta"><span className={`priority-chip ${feature.priority}`}>{feature.priority}</span>{feature.epic_id && <span className="mono-label">Epic</span>}</div></Link><button aria-label={`Move ${feature.key} to ${label(nextStatus)}`} className="card-move" disabled={saving} onClick={() => void move()} type="button">{saving ? "..." : `Move to ${label(nextStatus)}`}</button></article>;
}

function FeatureInventory({ data, onStatusChange }: { data: PlanningData; onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<void> }) {
  return <div className="inventory-grid"><section><div className="section-heading"><h2>Features</h2><span>{data.features.length} total</span></div>{data.features.length ? <div className="feature-list">{data.features.map((feature) => <FeatureCard feature={feature} key={feature.id} onStatusChange={onStatusChange} />)}</div> : <div className="quiet-empty-row">No features exist yet. Create the first planning record.</div>}</section><aside><div className="section-heading"><h2>Epics</h2><span>{data.epics.length} total</span></div>{data.epics.length ? <div className="epic-list">{data.epics.map((epic) => <div className="epic-card" key={epic.id}><span className="mono-label">EPIC</span><h3>{epic.title}</h3><p>{epic.description || "No description yet."}</p><span className="status-chip neutral">{epic.status}</span></div>)}</div> : <div className="quiet-empty-row">No epics yet.</div>}<div className="planning-disclaimer">Manual planning state. Satisfied criteria are user declarations, not evidence.</div></aside></div>;
}

function FeatureCreateForm({ epics, onSubmit, onCancel }: { epics: Epic[]; onSubmit: (payload: { title: string; description: string; goal: string; priority: FeaturePriority; status: FeatureStatus; epic_id?: string }) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [priority, setPriority] = useState<FeaturePriority>("medium");
  const [status, setStatus] = useState<FeatureStatus>("backlog");
  const [epicId, setEpicId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError("Feature title is required."); return; }
    setSaving(true);
    try { await onSubmit({ title, description, goal, priority, status, ...(epicId ? { epic_id: epicId } : {}) }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create feature."); } finally { setSaving(false); }
  };
  return <form className="planning-form" onSubmit={(event) => void submit(event)}><div className="section-heading"><h2>Create feature</h2><button className="icon-button" onClick={onCancel} type="button" aria-label="Close create feature">x</button></div><div className="form-grid"><label>Title<input autoFocus maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label>Priority<select onChange={(event) => setPriority(event.target.value as FeaturePriority)} value={priority}>{priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Initial state<select onChange={(event) => setStatus(event.target.value as FeatureStatus)} value={status}>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Epic<select onChange={(event) => setEpicId(event.target.value)} value={epicId}><option value="">Unassigned</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.title}</option>)}</select></label><label className="wide-field">Goal<textarea onChange={(event) => setGoal(event.target.value)} rows={2} value={goal} /></label><label className="wide-field">Description<textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button secondary" onClick={onCancel} type="button">Cancel</button><button className="button primary" disabled={saving} type="submit">{saving ? "Creating..." : "Create feature"}</button></div></form>;
}

function EpicCreateForm({ onSubmit, onCancel }: { onSubmit: (title: string, description: string) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return; setSaving(true); try { await onSubmit(title, description); } finally { setSaving(false); } };
  return <form className="planning-form compact-form" onSubmit={(event) => void submit(event)}><div className="section-heading"><h2>Create epic</h2><button className="icon-button" onClick={onCancel} type="button" aria-label="Close create epic">x</button></div><label>Title<input autoFocus maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label>Description<textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label><div className="form-actions"><button className="button secondary" onClick={onCancel} type="button">Cancel</button><button className="button primary" disabled={saving} type="submit">{saving ? "Creating..." : "Create epic"}</button></div></form>;
}

export function FeatureDetailPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: (button: HTMLButtonElement) => void }) {
  const { projectId, featureId } = useParams<{ projectId: string; featureId: string }>();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [dependencies, setDependencies] = useState<FeatureDependency[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspace || !projectId || !featureId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [nextFeature, nextTasks, nextCriteria, nextDependencies, nextFeatures] = await Promise.all([
        forgeApi.getFeature(workspace.id, projectId, featureId, controller.signal),
        forgeApi.listTasks(workspace.id, projectId, featureId, controller.signal),
        forgeApi.listCriteria(workspace.id, projectId, featureId, controller.signal),
        forgeApi.listDependencies(workspace.id, projectId, controller.signal),
        forgeApi.listFeatures(workspace.id, projectId, {}, controller.signal),
      ]);
      if (currentRequest !== requestId.current) return;
      setFeature(nextFeature); setTasks(nextTasks); setCriteria(nextCriteria); setDependencies(nextDependencies); setFeatures(nextFeatures); setError(null);
    } catch (cause) {
      if (controller.signal.aborted || currentRequest !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load feature.");
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [featureId, projectId, workspace]);
  // This effect synchronizes the detail view with the selected feature.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => { requestId.current += 1; controllerRef.current?.abort(); };
  }, [load]);
  const runAction = async (action: () => Promise<void>) => { try { setActionError(null); await action(); await load(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not save planning data."); } };
  const addTask = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const title = String(form.get("title") ?? "").trim(); if (!title || !workspace || !projectId || !featureId) return; await runAction(async () => { await forgeApi.createTask(workspace.id, projectId, featureId, { title }); formElement.reset(); }); };
  const addCriterion = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const description = String(form.get("description") ?? "").trim(); if (!description || !workspace || !projectId || !featureId) return; await runAction(async () => { await forgeApi.createCriterion(workspace.id, projectId, featureId, { description }); formElement.reset(); }); };
  const updateFeature = async (payload: { status?: FeatureStatus; priority?: FeaturePriority }) => { if (!workspace || !projectId || !featureId) return; await runAction(async () => { await forgeApi.updateFeature(workspace.id, projectId, featureId, payload); }); };
  const toggleCriterion = async (criterion: AcceptanceCriterion) => { if (!workspace || !projectId || !featureId) return; await runAction(async () => { await forgeApi.updateCriterion(workspace.id, projectId, featureId, criterion.id, { satisfied: !criterion.satisfied }); }); };
  const updateTask = async (task: Task, status: TaskStatus) => { if (!workspace || !projectId || !featureId) return; await runAction(async () => { await forgeApi.updateTask(workspace.id, projectId, featureId, task.id, { status }); }); };
  const addDependency = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const blocking = String(form.get("blocking") ?? ""); const blocked = String(form.get("blocked") ?? ""); if (!workspace || !projectId || !blocking || !blocked) return; await runAction(async () => { await forgeApi.createDependency(workspace.id, projectId, { blocking_feature_id: blocking, blocked_feature_id: blocked }); formElement.reset(); }); };
  const removeDependency = async (id: string) => { if (!workspace || !projectId) return; await runAction(() => forgeApi.deleteDependency(workspace.id, projectId, id)); };
  const dependencyLabel = (id: string) => features.find((item) => item.id === id)?.key ?? "Unknown feature";
  const otherFeatures = useMemo(() => features.filter((item) => item.id !== featureId), [featureId, features]);

  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Intent, tasks and manual acceptance criteria for one feature." title={feature ? `${feature.key} · ${feature.title}` : "Feature detail"}>
    <div className="planning-tabs"><Link className="detail-tab" to={`/projects/${projectId}/board`}>Board</Link><Link className="detail-tab active" to={`/projects/${projectId}/features/${featureId}`}>Feature detail</Link><Link className="detail-tab" to={`/projects/${projectId}`}>Overview</Link></div>
    {loading ? <LoadingPanel label="Loading feature" /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : feature ? <>
      <section className="feature-detail-header"><div><span className="mono-label">{feature.key}</span><h2>{feature.title}</h2><p>{feature.description || "No description yet."}</p>{feature.goal && <p className="feature-goal">Goal: {feature.goal}</p>}</div><div className="feature-controls"><label>State<select aria-label="Feature state" onChange={(event) => void updateFeature({ status: event.target.value as FeatureStatus })} value={feature.status}>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Priority<select aria-label="Feature priority" onChange={(event) => void updateFeature({ priority: event.target.value as FeaturePriority })} value={feature.priority}>{priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label></div></section>
      {actionError && <div className="feedback-panel error-panel" role="alert"><span>{actionError}</span><button className="button ghost" onClick={() => setActionError(null)} type="button">Dismiss</button></div>}
      <div className="feature-detail-grid"><section className="detail-section"><div className="section-heading"><h2>Tasks</h2><span>{tasks.length}</span></div><form className="inline-add" onSubmit={(event) => void addTask(event)}><input aria-label="New task" name="title" placeholder="Add a task" /><button className="button secondary" type="submit">Add</button></form>{tasks.length ? <ul className="planning-list">{tasks.map((task) => <li key={task.id}><span className={`task-state ${task.status}`} aria-hidden="true" /><span className={task.status === "done" ? "task-done" : ""}>{task.title}</span><select aria-label={`Status for ${task.title}`} onChange={(event) => void updateTask(task, event.target.value as TaskStatus)} value={task.status}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></li>)}</ul> : <div className="quiet-empty-row">Break the feature into small, local tasks.</div>}</section><section className="detail-section"><div className="section-heading"><h2>Acceptance criteria</h2><span>{criteria.filter((item) => item.satisfied).length} / {criteria.length} satisfied</span></div><p className="planning-disclaimer">Manual declaration only; this is not verification evidence.</p><form className="inline-add" onSubmit={(event) => void addCriterion(event)}><input aria-label="New acceptance criterion" name="description" placeholder="Add an acceptance criterion" /><button className="button secondary" type="submit">Add</button></form>{criteria.length ? <ul className="planning-list criteria-list">{criteria.map((criterion) => <li key={criterion.id}><button aria-label={`${criterion.satisfied ? "Mark unsatisfied" : "Mark satisfied"}: ${criterion.description}`} className={`criterion-check${criterion.satisfied ? " checked" : ""}`} onClick={() => void toggleCriterion(criterion)} type="button">{criterion.satisfied ? "✓" : ""}</button><span className={criterion.satisfied ? "task-done" : ""}>{criterion.description}</span></li>)}</ul> : <div className="quiet-empty-row">No criteria declared yet.</div>}</section></div>
      <section className="detail-section dependencies-section"><div className="section-heading"><h2>Dependencies</h2><span>{dependencies.length}</span></div><form className="dependency-form" onSubmit={(event) => void addDependency(event)}><label>Blocking<select name="blocking" defaultValue=""><option value="">Select feature</option>{otherFeatures.map((item) => <option key={item.id} value={item.id}>{item.key} · {item.title}</option>)}</select></label><span aria-hidden="true">blocks</span><label>Blocked<select name="blocked" defaultValue={feature.id}><option value={feature.id}>{feature.key} · {feature.title}</option>{otherFeatures.map((item) => <option key={item.id} value={item.id}>{item.key} · {item.title}</option>)}</select></label><button className="button secondary" type="submit">Add dependency</button></form>{dependencies.length ? <ul className="dependency-list">{dependencies.map((dependency) => <li key={dependency.id}><span>{dependencyLabel(dependency.blocking_feature_id)} blocks {dependencyLabel(dependency.blocked_feature_id)}</span><button className="button ghost" onClick={() => void removeDependency(dependency.id)} type="button">Remove</button></li>)}</ul> : <div className="quiet-empty-row">No feature dependencies declared.</div>}</section>
    </> : null}
  </PageFrame>;
}
