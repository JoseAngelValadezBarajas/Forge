import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  forgeApi,
  type AcceptanceCriterion,
  type Epic,
  type EpicStatus,
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
import { ReadinessPanel } from "./fnd03";

const statuses: FeatureStatus[] = ["backlog", "refining", "ready", "in_progress", "verify", "done"];
const priorities: FeaturePriority[] = ["low", "medium", "high", "critical"];
const epicStatuses: EpicStatus[] = ["planning", "archived"];

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

type PlanningData = {
  overview: ProjectPlanningOverview;
  epics: Epic[];
  features: Feature[];
  dependencies: FeatureDependency[];
};

function usePlanningData(
  workspace: Workspace | null,
  projectId: string | undefined,
  search = "",
  priority?: FeaturePriority,
) {
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
      setError(errorMessage(cause, "Could not load planning data."));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [priority, projectId, search, workspace]);

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

export function ProjectBoardPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: (button: HTMLButtonElement) => void;
}) {
  return <PlanningPage mode="board" onOpenPalette={onOpenPalette} workspace={workspace} />;
}

export function FeaturesPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: (button: HTMLButtonElement) => void;
}) {
  return <PlanningPage mode="features" onOpenPalette={onOpenPalette} workspace={workspace} />;
}

function PlanningPage({
  workspace,
  onOpenPalette,
  mode,
}: {
  workspace: Workspace | null;
  onOpenPalette: (button: HTMLButtonElement) => void;
  mode: "board" | "features";
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<FeaturePriority | undefined>();
  const [localCreateForm, setLocalCreateForm] = useState<"feature" | "epic" | null>(null);
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const { data, loading, error, reload } = usePlanningData(workspace, projectId, search, priority);
  const navigate = useNavigate();
  const routeCreateForm = useMemo<"feature" | "epic" | null>(() => {
    const intent = new URLSearchParams(location.search).get("create");
    return intent === "1" ? "feature" : intent === "epic" ? "epic" : null;
  }, [location.search]);
  const createForm = routeCreateForm ?? localCreateForm;
  const clearCreateIntent = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("create")) return;
    params.delete("create");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "", hash: location.hash }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);
  const closeCreateForm = useCallback(() => {
    setLocalCreateForm(null);
    clearCreateIntent();
  }, [clearCreateIntent]);

  const runMutation = async (action: () => Promise<void>, fallback: string): Promise<boolean> => {
    if (actionPending) return false;
    setActionPending(true);
    setActionError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (cause) {
      setActionError(errorMessage(cause, fallback));
      return false;
    } finally {
      setActionPending(false);
    }
  };

  const createFeature = async (payload: {
    title: string;
    description: string;
    goal: string;
    priority: FeaturePriority;
    status: FeatureStatus;
    epic_id?: string;
  }): Promise<boolean> => {
    if (!workspace || !projectId || actionPending) return false;
    setActionPending(true);
    setActionError(null);
    try {
      const feature = await forgeApi.createFeature(workspace.id, projectId, payload);
      await reload();
      setLocalCreateForm(null);
      navigate(`/projects/${projectId}/features/${feature.id}`);
      return true;
    } catch (cause) {
      setActionError(errorMessage(cause, "Could not create feature."));
      return false;
    } finally {
      setActionPending(false);
    }
  };

  const createEpic = (title: string, description: string): Promise<boolean> => {
    if (!workspace || !projectId) return Promise.resolve(false);
    return runMutation(
      async () => {
        await forgeApi.createEpic(workspace.id, projectId, { title, description });
        setLocalCreateForm(null);
        clearCreateIntent();
      },
      "Could not create epic.",
    );
  };

  const updateEpic = (epic: Epic, payload: { title: string; description: string; status: EpicStatus }): Promise<boolean> => {
    if (!workspace || !projectId) return Promise.resolve(false);
    return runMutation(
      async () => {
        await forgeApi.updateEpic(workspace.id, projectId, epic.id, payload);
        setEditingEpic(null);
      },
      "Could not update epic.",
    );
  };

  const updateStatus = (feature: Feature, nextStatus: FeatureStatus): Promise<boolean> => {
    if (!workspace || !projectId || feature.status === nextStatus) return Promise.resolve(false);
    return runMutation(
      () => forgeApi.updateFeature(workspace.id, projectId, feature.id, { status: nextStatus }).then(() => undefined),
      "Could not update feature.",
    );
  };

  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Manual planning state only. Verification and delivery evidence are separate milestones."
      title={mode === "board" ? "Project Board" : "Features & Epics"}
    >
      <div className="planning-toolbar">
        <div className="planning-tabs" role="tablist" aria-label="Project planning views">
          <Link className={mode === "board" ? "detail-tab active" : "detail-tab"} to={`/projects/${projectId}/board`}>Board</Link>
          <Link className={mode === "features" ? "detail-tab active" : "detail-tab"} to={`/projects/${projectId}/features`}>Features</Link>
          <Link className="detail-tab" to={`/projects/${projectId}`}>Overview</Link>
        </div>
        <div className="planning-actions">
          <button className="button secondary" disabled={actionPending} onClick={() => setLocalCreateForm("epic")} type="button">+ Epic</button>
          <button className="button primary" disabled={actionPending} onClick={() => setLocalCreateForm("feature")} type="button">+ Feature</button>
        </div>
      </div>
      <section className="planning-filters" aria-label="Feature filters">
        <label className="search-field">Search features<input aria-label="Search features" onChange={(event) => setSearch(event.target.value)} placeholder="Search title, goal or description" value={search} /></label>
        <label className="filter-field">Priority<select aria-label="Feature priority" onChange={(event) => setPriority(event.target.value ? event.target.value as FeaturePriority : undefined)} value={priority ?? ""}><option value="">All priorities</option>{priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      </section>
      {actionError && <div className="feedback-panel error-panel" role="alert"><span>{actionError}</span><button className="button ghost" onClick={() => setActionError(null)} type="button">Dismiss</button></div>}
      {createForm === "feature" && <FeatureCreateForm actionPending={actionPending} epics={data?.epics ?? []} onCancel={closeCreateForm} onSubmit={createFeature} />}
      {createForm === "epic" && <EpicCreateForm actionPending={actionPending} onCancel={closeCreateForm} onSubmit={createEpic} />}
      {editingEpic && <EpicEditForm actionPending={actionPending} epic={editingEpic} onCancel={() => setEditingEpic(null)} onSubmit={(payload) => updateEpic(editingEpic, payload)} />}
      {loading ? <LoadingPanel label="Loading planning data" /> : error ? <ErrorPanel message={error} onRetry={() => void reload()} /> : data ? mode === "board" ? <Board disabled={actionPending} features={data.features} onStatusChange={updateStatus} /> : <FeatureInventory data={data} disabled={actionPending} onEditEpic={setEditingEpic} onStatusChange={updateStatus} /> : null}
    </PageFrame>
  );
}

function Board({
  features,
  onStatusChange,
  disabled,
}: {
  features: Feature[];
  onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<boolean>;
  disabled: boolean;
}) {
  return <section className="kanban-board" aria-label="Feature workflow board">{statuses.map((status) => <div className={`kanban-column status-${status}`} key={status}><div className="kanban-heading"><h2>{label(status)}</h2><span>{features.filter((feature) => feature.status === status).length}</span></div><div className="kanban-cards">{features.filter((feature) => feature.status === status).map((feature) => <FeatureCard disabled={disabled} feature={feature} key={feature.id} onStatusChange={onStatusChange} />)}{features.every((feature) => feature.status !== status) && <p className="kanban-empty">No features here yet.</p>}</div></div>)}</section>;
}

function FeatureCard({
  feature,
  onStatusChange,
  disabled,
}: {
  feature: Feature;
  onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<boolean>;
  disabled: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const nextStatus = statuses[(statuses.indexOf(feature.status) + 1) % statuses.length];
  const move = async () => {
    setSaving(true);
    try { await onStatusChange(feature, nextStatus); } finally { setSaving(false); }
  };
  return <article className="feature-card"><Link className="feature-card-link" to={`/projects/${feature.project_id}/features/${feature.id}`}><span className="mono-label">{feature.key}</span><h3>{feature.title}</h3><div className="feature-card-meta"><span className={`priority-chip ${feature.priority}`}>{feature.priority}</span>{feature.epic_id && <span className="mono-label">Epic</span>}</div></Link><button aria-label={`Move ${feature.key} to ${label(nextStatus)}`} className="card-move" disabled={saving || disabled} onClick={() => void move()} type="button">{saving ? "..." : `Move to ${label(nextStatus)}`}</button></article>;
}

function FeatureInventory({
  data,
  onStatusChange,
  onEditEpic,
  disabled,
}: {
  data: PlanningData;
  onStatusChange: (feature: Feature, status: FeatureStatus) => Promise<boolean>;
  onEditEpic: (epic: Epic) => void;
  disabled: boolean;
}) {
  return <div className="inventory-grid"><section><div className="section-heading"><h2>Features</h2><span>{data.features.length} total</span></div>{data.features.length ? <div className="feature-list">{data.features.map((feature) => <FeatureCard disabled={disabled} feature={feature} key={feature.id} onStatusChange={onStatusChange} />)}</div> : <div className="quiet-empty-row">No features exist yet. Create the first planning record.</div>}</section><aside><div className="section-heading"><h2>Epics</h2><span>{data.epics.length} total</span></div>{data.epics.length ? <div className="epic-list">{data.epics.map((epic) => <article className="epic-card" key={epic.id}><span className="mono-label">EPIC</span><h3>{epic.title}</h3><p>{epic.description || "No description yet."}</p><span className="status-chip neutral">{label(epic.status)}</span><button className="button ghost" disabled={disabled} onClick={() => onEditEpic(epic)} type="button">Edit epic</button></article>)}</div> : <div className="quiet-empty-row">No epics yet.</div>}<div className="planning-disclaimer">Manual planning state. Satisfied criteria are user declarations, not evidence.</div></aside></div>;
}

type FeatureFormPayload = {
  title: string;
  description: string;
  goal: string;
  priority: FeaturePriority;
  status: FeatureStatus;
  epic_id?: string;
  clear_epic?: boolean;
};

function FeatureCreateForm({
  epics,
  onSubmit,
  onCancel,
  actionPending,
}: {
  epics: Epic[];
  onSubmit: (payload: Omit<FeatureFormPayload, "clear_epic">) => Promise<boolean>;
  onCancel: () => void;
  actionPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [priority, setPriority] = useState<FeaturePriority>("medium");
  const [status, setStatus] = useState<FeatureStatus>("backlog");
  const [epicId, setEpicId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError("Feature title is required."); return; }
    setError(null);
    await onSubmit({ title, description, goal, priority, status, ...(epicId ? { epic_id: epicId } : {}) });
  };
  return <form className="planning-form" onSubmit={(event) => void submit(event)}><div className="section-heading"><h2>Create feature</h2><button aria-label="Close create feature" className="icon-button" onClick={onCancel} type="button">x</button></div><div className="form-grid"><label>Title<input autoFocus maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label>Priority<select onChange={(event) => setPriority(event.target.value as FeaturePriority)} value={priority}>{priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Initial state<select onChange={(event) => setStatus(event.target.value as FeatureStatus)} value={status}>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Epic<select onChange={(event) => setEpicId(event.target.value)} value={epicId}><option value="">Unassigned</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.title}</option>)}</select></label><label className="wide-field">Goal<textarea onChange={(event) => setGoal(event.target.value)} rows={2} value={goal} /></label><label className="wide-field">Description<textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button secondary" onClick={onCancel} type="button">Cancel</button><button className="button primary" disabled={actionPending} type="submit">{actionPending ? "Creating..." : "Create feature"}</button></div></form>;
}

function EpicCreateForm({ onSubmit, onCancel, actionPending }: { onSubmit: (title: string, description: string) => Promise<boolean>; onCancel: () => void; actionPending: boolean }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!title.trim()) { setError("Epic title is required."); return; } setError(null); await onSubmit(title, description); };
  return <form className="planning-form compact-form" onSubmit={(event) => void submit(event)}><div className="section-heading"><h2>Create epic</h2><button aria-label="Close create epic" className="icon-button" onClick={onCancel} type="button">x</button></div><label>Title<input autoFocus maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label>Description<textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button secondary" onClick={onCancel} type="button">Cancel</button><button className="button primary" disabled={actionPending} type="submit">{actionPending ? "Creating..." : "Create epic"}</button></div></form>;
}

function EpicEditForm({ epic, onSubmit, onCancel, actionPending }: { epic: Epic; onSubmit: (payload: { title: string; description: string; status: EpicStatus }) => Promise<boolean>; onCancel: () => void; actionPending: boolean }) {
  const [title, setTitle] = useState(epic.title);
  const [description, setDescription] = useState(epic.description ?? "");
  const [status, setStatus] = useState<EpicStatus>(epic.status);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!title.trim()) { setError("Epic title is required."); return; } setError(null); const saved = await onSubmit({ title, description, status }); if (!saved) setError("Could not save epic. Try again."); };
  return <form className="planning-form compact-form" onSubmit={(event) => void submit(event)}><div className="section-heading"><h2>Edit epic</h2><button aria-label="Close edit epic" className="icon-button" onClick={onCancel} type="button">x</button></div><label>Title<input maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label>Description<textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label><label>Status<select onChange={(event) => setStatus(event.target.value as EpicStatus)} value={status}>{epicStatuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button secondary" onClick={onCancel} type="button">Cancel</button><button className="button primary" disabled={actionPending} type="submit">{actionPending ? "Saving..." : "Save epic"}</button></div></form>;
}

type FeatureDetailProps = { workspace: Workspace | null; onOpenPalette: (button: HTMLButtonElement) => void };

export function FeatureDetailPage({ workspace, onOpenPalette }: FeatureDetailProps) {
  const { projectId, featureId } = useParams<{ projectId: string; featureId: string }>();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [dependencies, setDependencies] = useState<FeatureDependency[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [readinessRefreshKey, setReadinessRefreshKey] = useState(0);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newCriterionDescription, setNewCriterionDescription] = useState("");
  const [dependencyTarget, setDependencyTarget] = useState("");
  const [dependencyDirection, setDependencyDirection] = useState<"blocked_by" | "blocks">("blocked_by");
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
      const [nextFeature, nextEpics, nextTasks, nextCriteria, nextDependencies, nextFeatures] = await Promise.all([
        forgeApi.getFeature(workspace.id, projectId, featureId, controller.signal),
        forgeApi.listEpics(workspace.id, projectId, controller.signal),
        forgeApi.listTasks(workspace.id, projectId, featureId, controller.signal),
        forgeApi.listCriteria(workspace.id, projectId, featureId, controller.signal),
        forgeApi.listDependencies(workspace.id, projectId, controller.signal),
        forgeApi.listFeatures(workspace.id, projectId, {}, controller.signal),
      ]);
      if (currentRequest !== requestId.current) return;
      setFeature(nextFeature);
      setEpics(nextEpics);
      setTasks(nextTasks);
      setCriteria(nextCriteria);
      setDependencies(nextDependencies);
      setFeatures(nextFeatures);
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || currentRequest !== requestId.current) return;
      setError(errorMessage(cause, "Could not load feature."));
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [featureId, projectId, workspace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => { requestId.current += 1; controllerRef.current?.abort(); };
  }, [load]);

  const performMutation = async (action: () => Promise<void>, fallback: string): Promise<boolean> => {
    if (mutationPending) return false;
    setMutationPending(true);
    setActionError(null);
    try {
      await action();
      await load();
      setReadinessRefreshKey((current) => current + 1);
      return true;
    } catch (cause) {
      setActionError(errorMessage(cause, fallback));
      return false;
    } finally { setMutationPending(false); }
  };

  const saveFeature = (payload: FeatureFormPayload): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(() => forgeApi.updateFeature(workspace.id, projectId, featureId, payload).then(() => undefined), "Could not save feature.");
  };
  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) { setActionError("Task title is required."); return; }
    if (!workspace || !projectId || !featureId) return;
    const saved = await performMutation(() => forgeApi.createTask(workspace.id, projectId, featureId, { title }).then(() => undefined), "Could not create task.");
    if (saved) setNewTaskTitle("");
  };
  const addCriterion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const description = newCriterionDescription.trim();
    if (!description) { setActionError("Acceptance criterion is required."); return; }
    if (!workspace || !projectId || !featureId) return;
    const saved = await performMutation(() => forgeApi.createCriterion(workspace.id, projectId, featureId, { description }).then(() => undefined), "Could not create acceptance criterion.");
    if (saved) setNewCriterionDescription("");
  };
  const saveTask = (task: Task, payload: { title: string; description: string; status: TaskStatus }): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(() => forgeApi.updateTask(workspace.id, projectId, featureId, task.id, payload).then(() => undefined), "Could not save task.");
  };
  const reorderTasks = (ids: string[]): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(() => forgeApi.reorderTasks(workspace.id, projectId, featureId, ids).then(() => undefined), "Could not reorder tasks.");
  };
  const saveCriterion = (criterion: AcceptanceCriterion, payload: { description: string; satisfied: boolean }): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(() => forgeApi.updateCriterion(workspace.id, projectId, featureId, criterion.id, payload).then(() => undefined), "Could not save acceptance criterion.");
  };
  const reorderCriteria = (ids: string[]): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(() => forgeApi.reorderCriteria(workspace.id, projectId, featureId, ids).then(() => undefined), "Could not reorder acceptance criteria.");
  };
  const addDependency = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = dependencyTarget;
    const direction = dependencyDirection;
    if (!target) { setActionError("Select a feature dependency first."); return; }
    if (!workspace || !projectId || !featureId) return;
    const payload = direction === "blocked_by"
      ? { blocking_feature_id: target, blocked_feature_id: featureId }
      : { blocking_feature_id: featureId, blocked_feature_id: target };
    const saved = await performMutation(() => forgeApi.createDependency(workspace.id, projectId, payload).then(() => undefined), "Could not create dependency.");
    if (saved) {
      setDependencyTarget("");
      setDependencyDirection("blocked_by");
    }
  };
  const removeDependency = (id: string): Promise<boolean> => {
    if (!workspace || !projectId) return Promise.resolve(false);
    return performMutation(() => forgeApi.deleteDependency(workspace.id, projectId, id), "Could not remove dependency.");
  };

  const dependencyLabel = (id: string) => {
    const item = features.find((candidate) => candidate.id === id);
    return item ? `${item.key} · ${item.title}` : "Unknown feature";
  };
  const otherFeatures = useMemo(() => features.filter((item) => item.id !== featureId), [featureId, features]);
  const blockedBy = dependencies.filter((dependency) => dependency.blocked_feature_id === featureId);
  const blocks = dependencies.filter((dependency) => dependency.blocking_feature_id === featureId);

  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Intent, tasks and manual acceptance criteria for one feature." title={feature ? `${feature.key} · ${feature.title}` : "Feature detail"}>
    <div className="planning-tabs"><Link className="detail-tab" to={`/projects/${projectId}/board`}>Board</Link><Link className="detail-tab active" to={`/projects/${projectId}/features/${featureId}`}>Feature detail</Link><Link className="detail-tab" to={`/projects/${projectId}/features/${featureId}/context`}>Context</Link><Link className="detail-tab" to={`/projects/${projectId}`}>Overview</Link></div>
    {loading ? <LoadingPanel label="Loading feature" /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : feature ? <>
      <FeatureEditForm key={`${feature.id}-${feature.updated_at}`} actionPending={mutationPending} epics={epics} feature={feature} onSubmit={saveFeature} />
      {actionError && <div className="feedback-panel error-panel" role="alert"><span>{actionError}</span><button className="button ghost" onClick={() => setActionError(null)} type="button">Dismiss</button></div>}
      {workspace && projectId && <ReadinessPanel feature={feature} projectId={projectId} refreshKey={readinessRefreshKey} workspace={workspace} />}
      <div className="feature-detail-grid"><section className="detail-section"><div className="section-heading"><h2>Tasks</h2><span>{tasks.length}</span></div><form className="inline-add" onSubmit={(event) => void addTask(event)}><input aria-label="New task" name="title" onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="Add a task" value={newTaskTitle} /><button className="button secondary" disabled={mutationPending} type="submit">Add</button></form>{tasks.length ? <ul className="planning-list">{tasks.map((task, index) => <TaskRow disabled={mutationPending} first={index === 0} key={task.id} last={index === tasks.length - 1} onMove={(direction) => reorderTasks(moveIds(tasks, index, direction))} onSave={(payload) => saveTask(task, payload)} task={task} />)}</ul> : <div className="quiet-empty-row">Break the feature into small, local tasks.</div>}</section><section className="detail-section"><div className="section-heading"><h2>Acceptance criteria</h2><span>{criteria.filter((item) => item.satisfied).length} / {criteria.length} satisfied</span></div><p className="planning-disclaimer">Manual declaration only; this is not verification evidence.</p><form className="inline-add" onSubmit={(event) => void addCriterion(event)}><input aria-label="New acceptance criterion" name="description" onChange={(event) => setNewCriterionDescription(event.target.value)} placeholder="Add an acceptance criterion" value={newCriterionDescription} /><button className="button secondary" disabled={mutationPending} type="submit">Add</button></form>{criteria.length ? <ul className="planning-list criteria-list">{criteria.map((criterion, index) => <CriterionRow criterion={criterion} disabled={mutationPending} first={index === 0} key={criterion.id} last={index === criteria.length - 1} onMove={(direction) => reorderCriteria(moveIds(criteria, index, direction))} onSave={(payload) => saveCriterion(criterion, payload)} />)}</ul> : <div className="quiet-empty-row">No criteria declared yet.</div>}</section></div>
      <section className="detail-section dependencies-section"><div className="section-heading"><h2>Dependencies</h2><span>{dependencies.length}</span></div><form className="dependency-form" onSubmit={(event) => void addDependency(event)}><label>Relationship<select aria-label="Dependency relationship" onChange={(event) => setDependencyDirection(event.target.value as "blocked_by" | "blocks")} value={dependencyDirection}><option value="blocked_by">Blocked by</option><option value="blocks">Blocks</option></select></label><label>Feature<select aria-label="Dependency feature" onChange={(event) => setDependencyTarget(event.target.value)} value={dependencyTarget}><option value="">Select feature</option>{otherFeatures.map((item) => <option key={item.id} value={item.id}>{item.key} · {item.title}</option>)}</select></label><button className="button secondary" disabled={mutationPending} type="submit">Add dependency</button></form><div className="dependency-groups"><DependencyGroup disabled={mutationPending} items={blockedBy} labelText="Blocked by" onRemove={removeDependency} resolve={dependencyLabel} empty="No features block this feature." /><DependencyGroup disabled={mutationPending} items={blocks} labelText="Blocks" onRemove={removeDependency} resolve={dependencyLabel} empty="This feature blocks nothing yet." /></div></section>
    </> : null}
  </PageFrame>;
}

function moveIds<T extends { id: string }>(items: T[], index: number, direction: "up" | "down"): string[] {
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= items.length) return items.map((item) => item.id);
  const ids = items.map((item) => item.id);
  [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
  return ids;
}

function FeatureEditForm({ feature, epics, onSubmit, actionPending }: { feature: Feature; epics: Epic[]; onSubmit: (payload: FeatureFormPayload) => Promise<boolean>; actionPending: boolean }) {
  const [title, setTitle] = useState(feature.title);
  const [description, setDescription] = useState(feature.description ?? "");
  const [goal, setGoal] = useState(feature.goal ?? "");
  const [priority, setPriority] = useState<FeaturePriority>(feature.priority);
  const [status, setStatus] = useState<FeatureStatus>(feature.status);
  const [epicId, setEpicId] = useState(feature.epic_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError("Feature title is required."); return; }
    setError(null);
    const saved = await onSubmit({ title, description, goal, priority, status, ...(epicId ? { epic_id: epicId } : { clear_epic: true }) });
    if (!saved) setError("Could not save feature. Try again.");
  };
  return <form className="planning-form feature-edit-form" onSubmit={(event) => void submit(event)}><div className="section-heading"><div><span className="mono-label">{feature.key}</span><h2>Edit feature</h2></div><span className="planning-disclaimer">Manual planning state</span></div><div className="form-grid"><label>Title<input aria-label="Feature title" maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label>Priority<select aria-label="Feature priority" onChange={(event) => setPriority(event.target.value as FeaturePriority)} value={priority}>{priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Status<select aria-label="Feature state" onChange={(event) => setStatus(event.target.value as FeatureStatus)} value={status}>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label>Epic<select aria-label="Feature epic" onChange={(event) => setEpicId(event.target.value)} value={epicId}><option value="">Unassigned</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.title}</option>)}</select></label><label className="wide-field">Goal<textarea aria-label="Feature goal" onChange={(event) => setGoal(event.target.value)} rows={2} value={goal} /></label><label className="wide-field">Description<textarea aria-label="Feature description" onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button primary" disabled={actionPending} type="submit">{actionPending ? "Saving..." : "Save feature"}</button></div></form>;
}

function TaskRow({ task, onSave, onMove, first, last, disabled }: { task: Task; onSave: (payload: { title: string; description: string; status: TaskStatus }) => Promise<boolean>; onMove: (direction: "up" | "down") => Promise<boolean>; first: boolean; last: boolean; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent) => { event.preventDefault(); if (!title.trim()) { setError("Task title is required."); return; } setSaving(true); const saved = await onSave({ title, description, status }); setSaving(false); if (saved) { setEditing(false); setError(null); } else setError("Could not save task. Try again."); };
  const updateStatus = async (nextStatus: TaskStatus) => { setSaving(true); const saved = await onSave({ title: task.title, description: task.description ?? "", status: nextStatus }); setSaving(false); if (!saved) setError("Could not save task. Try again."); };
  const move = async (direction: "up" | "down") => { setSaving(true); await onMove(direction); setSaving(false); };
  return <li className="planning-item"><span className={`task-state ${task.status}`} aria-hidden="true" />{editing ? <form className="item-edit-form" onSubmit={(event) => void save(event)}><label>Title<input aria-label={`Task title for ${task.title}`} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label>Description<input aria-label={`Task description for ${task.title}`} onChange={(event) => setDescription(event.target.value)} value={description} /></label><label>Status<select aria-label={`Task state for ${task.title}`} onChange={(event) => setStatus(event.target.value as TaskStatus)} value={status}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label><button className="button secondary" disabled={saving || disabled} type="submit">{saving ? "Saving..." : "Save"}</button><button className="button ghost" disabled={saving || disabled} onClick={() => setEditing(false)} type="button">Cancel</button></form> : <><span className="planning-item-copy"><strong className={task.status === "done" ? "task-done" : ""}>{task.title}</strong>{task.description && <small>{task.description}</small>}</span><select aria-label={`Status for ${task.title}`} disabled={disabled || saving} onChange={(event) => { setStatus(event.target.value as TaskStatus); void updateStatus(event.target.value as TaskStatus); }} value={task.status}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select><button aria-label={`Edit task ${task.title}`} className="button ghost" disabled={disabled || saving} onClick={() => setEditing(true)} type="button">Edit</button></>}<div className="reorder-controls"><button aria-label={`Move task ${task.title} up`} className="icon-button" disabled={first || saving || disabled} onClick={() => void move("up")} type="button">↑</button><button aria-label={`Move task ${task.title} down`} className="icon-button" disabled={last || saving || disabled} onClick={() => void move("down")} type="button">↓</button></div>{error && <span className="form-error" role="alert">{error}</span>}</li>;
}

function CriterionRow({ criterion, onSave, onMove, first, last, disabled }: { criterion: AcceptanceCriterion; onSave: (payload: { description: string; satisfied: boolean }) => Promise<boolean>; onMove: (direction: "up" | "down") => Promise<boolean>; first: boolean; last: boolean; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(criterion.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent) => { event.preventDefault(); if (!description.trim()) { setError("Acceptance criterion is required."); return; } setSaving(true); const saved = await onSave({ description, satisfied: criterion.satisfied }); setSaving(false); if (saved) { setEditing(false); setError(null); } else setError("Could not save acceptance criterion. Try again."); };
  const toggle = async () => { setSaving(true); await onSave({ description: criterion.description, satisfied: !criterion.satisfied }); setSaving(false); };
  const move = async (direction: "up" | "down") => { setSaving(true); await onMove(direction); setSaving(false); };
  return <li className="planning-item criterion-item">{editing ? <form className="item-edit-form" onSubmit={(event) => void save(event)}><label>Description<input aria-label={`Criterion description for ${criterion.description}`} onChange={(event) => setDescription(event.target.value)} value={description} /></label><button className="button secondary" disabled={saving || disabled} type="submit">{saving ? "Saving..." : "Save"}</button><button className="button ghost" disabled={saving || disabled} onClick={() => setEditing(false)} type="button">Cancel</button></form> : <><button aria-label={`${criterion.satisfied ? "Mark unsatisfied" : "Mark satisfied"}: ${criterion.description}`} className={`criterion-check${criterion.satisfied ? " checked" : ""}`} disabled={saving || disabled} onClick={() => void toggle()} type="button">{criterion.satisfied ? "✓" : ""}</button><span className="planning-item-copy"><strong className={criterion.satisfied ? "task-done" : ""}>{criterion.description}</strong><small>Manual declaration only; not verification evidence.</small></span><button aria-label={`Edit criterion ${criterion.description}`} className="button ghost" disabled={disabled} onClick={() => setEditing(true)} type="button">Edit</button></>}<div className="reorder-controls"><button aria-label={`Move criterion ${criterion.description} up`} className="icon-button" disabled={first || saving || disabled} onClick={() => void move("up")} type="button">↑</button><button aria-label={`Move criterion ${criterion.description} down`} className="icon-button" disabled={last || saving || disabled} onClick={() => void move("down")} type="button">↓</button></div>{error && <span className="form-error" role="alert">{error}</span>}</li>;
}

function DependencyGroup({ labelText, items, resolve, onRemove, empty, disabled }: { labelText: string; items: FeatureDependency[]; resolve: (id: string) => string; onRemove: (id: string) => Promise<boolean>; empty: string; disabled: boolean }) {
  return <section className="dependency-group"><div className="section-heading"><h3>{labelText}</h3><span>{items.length}</span></div>{items.length ? <ul className="dependency-list">{items.map((dependency) => <li key={dependency.id}><span>{resolve(labelText === "Blocked by" ? dependency.blocking_feature_id : dependency.blocked_feature_id)}</span><button className="button ghost" disabled={disabled} onClick={() => void onRemove(dependency.id)} type="button">Remove</button></li>)}</ul> : <div className="quiet-empty-row">{empty}</div>}</section>;
}
