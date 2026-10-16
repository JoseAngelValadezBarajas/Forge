import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";

import {
  forgeApi,
  ApiError,
  type ApplicableInvariant,
  type Decision,
  type DecisionCreatePayload,
  type DecisionRevision,
  type Feature,
  type Invariant,
  type InvariantCreatePayload,
  type ReadinessEvaluation,
  type Workspace,
} from "./api";
import { ErrorPanel } from "./shared/ui/ErrorPanel";
import { LoadingPanel } from "./shared/ui/LoadingPanel";
import { PageFrame } from "./shared/ui/PageFrame";

type PaletteOpener = (button: HTMLButtonElement) => void;

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function stamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const emptyDecision: DecisionCreatePayload = { title: "", context: "", decision: "", rationale: "" };
const emptyInvariant: InvariantCreatePayload = { title: "", statement: "", rationale: "" };

function DecisionForm({
  initial = emptyDecision,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  initial?: DecisionCreatePayload;
  onCancel?: () => void;
  onSubmit: (payload: DecisionCreatePayload) => Promise<boolean>;
  submitLabel: string;
}) {
  const [form, setForm] = useState<DecisionCreatePayload>(initial);
  const [error, setError] = useState<string | null>(null);
  const change = (key: keyof DecisionCreatePayload, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (![form.title, form.context, form.decision, form.rationale].every((value) => value?.trim())) {
      setError("Title, context, decision and rationale are required.");
      return;
    }
    setError(null);
    const saved = await onSubmit(form);
    if (!saved) setError("Could not save the decision. Try again.");
  };
  return <form className="planning-form fnd-form" onSubmit={(event) => void submit(event)}><div className="section-heading"><div><span className="eyebrow accent">DECISION CONTEXT</span><h2>{submitLabel}</h2></div>{onCancel && <button aria-label="Close decision form" className="icon-button" onClick={onCancel} type="button">x</button>}</div><div className="form-grid"><label>Title<input autoFocus maxLength={160} onChange={(event) => change("title", event.target.value)} value={form.title} /></label><label>Context<textarea aria-label="Decision context" onChange={(event) => change("context", event.target.value)} rows={3} value={form.context} /></label><label>Decision<textarea aria-label="Decision" onChange={(event) => change("decision", event.target.value)} rows={3} value={form.decision} /></label><label>Rationale<textarea aria-label="Decision rationale" onChange={(event) => change("rationale", event.target.value)} rows={3} value={form.rationale} /></label><label>Alternatives considered<textarea onChange={(event) => change("alternatives_considered", event.target.value)} rows={2} value={form.alternatives_considered ?? ""} /></label><label>Tradeoffs<textarea onChange={(event) => change("tradeoffs", event.target.value)} rows={2} value={form.tradeoffs ?? ""} /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions">{onCancel && <button className="button secondary" onClick={onCancel} type="button">Cancel</button>}<button className="button primary" type="submit">{submitLabel}</button></div></form>;
}

function DecisionCard({
  decision,
  onAccept,
  onEdit,
  onSupersede,
  onHistory,
}: {
  decision: Decision;
  onAccept: (decision: Decision) => void;
  onEdit: (decision: Decision) => void;
  onSupersede: (decision: Decision) => void;
  onHistory: (decision: Decision) => void;
}) {
  return <article className="fnd-record-card"><div className="fnd-record-header"><div><span className="mono-label">REVISION {decision.revision}</span><h3>{decision.title}</h3></div><span className={`status-chip ${decision.status}`}>{decision.status}</span></div><p>{decision.decision}</p><small>Why: {decision.rationale}</small><div className="fnd-record-actions">{decision.status === "proposed" && <button className="button secondary" onClick={() => onAccept(decision)} type="button">Accept decision</button>}{decision.status !== "superseded" && <><button className="button ghost" onClick={() => onEdit(decision)} type="button">Edit</button><button className="button ghost" onClick={() => onSupersede(decision)} type="button">Supersede</button></>}<button className="button ghost" onClick={() => onHistory(decision)} type="button">History</button></div>{decision.superseded_by_id && <p className="planning-disclaimer">Replaced by a successor decision. Historical context remains available.</p>}</article>;
}

export function DecisionsPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const { projectId } = useParams<{ projectId: string }>();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Decision | null>(null);
  const [history, setHistory] = useState<Record<string, DecisionRevision[]>>({});
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!workspace || !projectId) return;
    setLoading(true);
    try { const next = await forgeApi.listDecisions(workspace.id, projectId, signal); setDecisions(Array.isArray(next) ? next : []); setError(null); } catch (cause) { if (!signal?.aborted) setError(message(cause, "Could not load decisions.")); } finally { if (!signal?.aborted) setLoading(false); }
  }, [projectId, workspace]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const mutate = async (action: () => Promise<unknown>, fallback: string) => { try { await action(); await load(); return true; } catch (cause) { setError(message(cause, fallback)); return false; } };
  const create = (payload: DecisionCreatePayload) => mutate(async () => { if (!workspace || !projectId) return; await forgeApi.createDecision(workspace.id, projectId, payload); setFormOpen(false); }, "Could not create decision.");
  const update = (payload: DecisionCreatePayload) => mutate(async () => { if (!workspace || !projectId || !editing) return; await forgeApi.updateDecision(workspace.id, projectId, editing.id, payload); setEditing(null); }, "Could not update decision.");
  const accept = (decision: Decision) => { if (!workspace || !projectId) return; void mutate(() => forgeApi.acceptDecision(workspace.id, projectId, decision.id), "Could not accept decision."); };
  const supersede = (decision: Decision) => { if (!workspace || !projectId) return; const title = window.prompt("Successor decision title", decision.title); if (!title) return; const payload = { title, context: decision.context, decision: decision.decision, rationale: decision.rationale, alternatives_considered: decision.alternatives_considered ?? undefined, tradeoffs: decision.tradeoffs ?? undefined }; void mutate(() => forgeApi.supersedeDecision(workspace.id, projectId, decision.id, payload), "Could not supersede decision."); };
  const showHistory = async (decision: Decision) => { if (!workspace || !projectId) return; try { const items = await forgeApi.listDecisionRevisions(workspace.id, projectId, decision.id); setHistory((current) => ({ ...current, [decision.id]: items })); } catch (cause) { setError(message(cause, "Could not load decision history.")); } };
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Durable product context for why Forge work exists." title="Project Decisions"><div className="fnd-toolbar"><div><span className="eyebrow">DECISION INVENTORY</span><p>Decisions are reported context, not technical verification.</p></div><button className="button primary" onClick={() => setFormOpen(true)} type="button">+ New decision</button></div>{(formOpen || editing) && <DecisionForm initial={editing ? { title: editing.title, context: editing.context, decision: editing.decision, rationale: editing.rationale, alternatives_considered: editing.alternatives_considered ?? undefined, tradeoffs: editing.tradeoffs ?? undefined } : undefined} onCancel={() => { setFormOpen(false); setEditing(null); }} onSubmit={editing ? update : create} submitLabel={editing ? "Save decision" : "Create decision"} />}{error && <ErrorPanel message={error} onRetry={() => void load()} />}{loading ? <LoadingPanel label="Loading decisions" /> : decisions.length ? <div className="fnd-record-list">{decisions.map((decision) => <div key={decision.id}><DecisionCard decision={decision} onAccept={accept} onEdit={setEditing} onHistory={(item) => void showHistory(item)} onSupersede={supersede} />{history[decision.id] && <div className="fnd-history" aria-label={`History for ${decision.title}`}><strong>Historical revisions</strong>{history[decision.id].map((item, index) => <details key={item.id} open={index === history[decision.id].length - 1}><summary>Revision {item.revision} · {item.title} · {item.status}</summary><div className="fnd-history-detail"><p><strong>Context</strong>{item.context}</p><p><strong>Decision</strong>{item.decision}</p><p><strong>Rationale</strong>{item.rationale}</p>{item.alternatives_considered && <p><strong>Alternatives</strong>{item.alternatives_considered}</p>}{item.tradeoffs && <p><strong>Tradeoffs</strong>{item.tradeoffs}</p>}</div></details>)}</div>}</div>)}</div> : <div className="empty-panel"><div><span className="eyebrow accent">NO DECISIONS YET</span><h3>Preserve the first important choice</h3><p>Capture context before a feature becomes implementation work.</p></div><button className="button secondary" onClick={() => setFormOpen(true)} type="button">Create decision</button></div>}</PageFrame>;
}

function InvariantForm({ initial = emptyInvariant, features, onCancel, onSubmit, submitLabel }: { initial?: InvariantCreatePayload; features: Feature[]; onCancel?: () => void; onSubmit: (payload: InvariantCreatePayload) => Promise<boolean>; submitLabel: string }) {
  const [form, setForm] = useState<InvariantCreatePayload>(initial);
  const [error, setError] = useState<string | null>(null);
  const change = (key: keyof InvariantCreatePayload, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); if (![form.title, form.statement, form.rationale].every((value) => value?.trim())) { setError("Title, statement and rationale are required."); return; } setError(null); const saved = await onSubmit(form); if (!saved) setError("Could not save the invariant. Try again."); };
  return <form className="planning-form fnd-form" onSubmit={(event) => void submit(event)}><div className="section-heading"><div><span className="eyebrow accent">INVARIANT SCOPE</span><h2>{submitLabel}</h2></div>{onCancel && <button aria-label="Close invariant form" className="icon-button" onClick={onCancel} type="button">x</button>}</div><div className="form-grid"><label>Title<input autoFocus maxLength={160} onChange={(event) => change("title", event.target.value)} value={form.title} /></label><label>Scope<select aria-label="Invariant scope" onChange={(event) => change("feature_id", event.target.value)} value={form.feature_id ?? ""}><option value="">Project invariant</option>{features.map((feature) => <option key={feature.id} value={feature.id}>{feature.key} · {feature.title}</option>)}</select></label><label className="wide-field">Statement<textarea onChange={(event) => change("statement", event.target.value)} rows={3} value={form.statement} /></label><label className="wide-field">Rationale<textarea onChange={(event) => change("rationale", event.target.value)} rows={3} value={form.rationale} /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions">{onCancel && <button className="button secondary" onClick={onCancel} type="button">Cancel</button>}<button className="button primary" type="submit">{submitLabel}</button></div></form>;
}

export function InvariantsPage({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: PaletteOpener }) {
  const { projectId } = useParams<{ projectId: string }>();
  const [invariants, setInvariants] = useState<Invariant[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invariant | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => { if (!workspace || !projectId) return; setLoading(true); try { const [nextInvariants, nextFeatures] = await Promise.all([forgeApi.listInvariants(workspace.id, projectId, true, signal), forgeApi.listFeatures(workspace.id, projectId, {}, signal)]); setInvariants(Array.isArray(nextInvariants) ? nextInvariants : []); setFeatures(Array.isArray(nextFeatures) ? nextFeatures : []); setError(null); } catch (cause) { if (!signal?.aborted) setError(message(cause, "Could not load invariants.")); } finally { if (!signal?.aborted) setLoading(false); } }, [projectId, workspace]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const mutate = async (action: () => Promise<unknown>, fallback: string) => { try { await action(); await load(); return true; } catch (cause) { setError(message(cause, fallback)); return false; } };
  const create = (payload: InvariantCreatePayload) => mutate(async () => { if (!workspace || !projectId) return; await forgeApi.createInvariant(workspace.id, projectId, payload); setFormOpen(false); }, "Could not create invariant.");
  const update = (payload: InvariantCreatePayload) => mutate(async () => { if (!workspace || !projectId || !editing) return; await forgeApi.updateInvariant(workspace.id, projectId, editing.id, payload); setEditing(null); }, "Could not update invariant.");
  const retire = (item: Invariant) => { if (!workspace || !projectId || !window.confirm(`Retire ${item.title}? It will remain in history.`)) return; void mutate(() => forgeApi.retireInvariant(workspace.id, projectId, item.id), "Could not retire invariant."); };
  return <PageFrame onOpenPalette={onOpenPalette} subtitle="Durable constraints that remain visible while a project evolves." title="Project Invariants"><div className="fnd-toolbar"><div><span className="eyebrow">INVARIANT INVENTORY</span><p>Acknowledged means reviewed, not technically compliant.</p></div><button className="button primary" onClick={() => setFormOpen(true)} type="button">+ New invariant</button></div>{(formOpen || editing) && <InvariantForm features={features} initial={editing ? { title: editing.title, statement: editing.statement, rationale: editing.rationale, feature_id: editing.feature_id ?? undefined } : undefined} onCancel={() => { setFormOpen(false); setEditing(null); }} onSubmit={editing ? update : create} submitLabel={editing ? "Save invariant" : "Create invariant"} />}{error && <ErrorPanel message={error} onRetry={() => void load()} />}{loading ? <LoadingPanel label="Loading invariants" /> : invariants.length ? <div className="fnd-record-list">{invariants.map((item) => <article className="fnd-record-card" key={item.id}><div className="fnd-record-header"><div><span className="mono-label">REVISION {item.revision} · {item.feature_id ? "FEATURE" : "PROJECT"}</span><h3>{item.title}</h3></div><span className={`status-chip ${item.status}`}>{item.status}</span></div><p>{item.statement}</p><small>Why: {item.rationale}</small><div className="fnd-record-actions">{item.status === "active" && <><button className="button ghost" onClick={() => setEditing(item)} type="button">Edit</button><button className="button ghost" onClick={() => retire(item)} type="button">Retire</button></>}</div></article>)}</div> : <div className="empty-panel"><div><span className="eyebrow accent">NO INVARIANTS YET</span><h3>Make the constraint explicit</h3><p>Project invariants will apply to every Feature; feature invariants remain local.</p></div><button className="button secondary" onClick={() => setFormOpen(true)} type="button">Create invariant</button></div>}</PageFrame>;
}

export function ReadinessPanel({ workspace, projectId, feature, refreshKey }: { workspace: Workspace; projectId: string; feature: Feature; refreshKey: string | number }) {
  const [preview, setPreview] = useState<ReadinessEvaluation | null>(null);
  const [history, setHistory] = useState<ReadinessEvaluation[]>([]);
  const [invariants, setInvariants] = useState<ApplicableInvariant[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [allDecisions, setAllDecisions] = useState<Decision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"preview" | "save" | "link" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const load = useCallback(async () => { void refreshKey; actionController.current?.abort(); setPending(null); const controller = new AbortController(); loadController.current?.abort(); loadController.current = controller; setLoading(true); try { const [nextPreview, nextHistory, nextInvariants, nextDecisions, nextAllDecisions] = await Promise.all([forgeApi.previewReadiness(workspace.id, projectId, feature.id, controller.signal), forgeApi.listReadinessEvaluations(workspace.id, projectId, feature.id, controller.signal), forgeApi.listFeatureInvariants(workspace.id, projectId, feature.id, controller.signal), forgeApi.listFeatureDecisions(workspace.id, projectId, feature.id, controller.signal), forgeApi.listDecisions(workspace.id, projectId, controller.signal)]); setPreview(nextPreview && Array.isArray(nextPreview.results) ? nextPreview : null); setHistory(Array.isArray(nextHistory) ? nextHistory.filter((item) => Boolean(item?.evaluation_id && item.evaluated_at)) : []); setInvariants(Array.isArray(nextInvariants) ? nextInvariants : []); setDecisions(Array.isArray(nextDecisions) ? nextDecisions : []); setAllDecisions(Array.isArray(nextAllDecisions) ? nextAllDecisions : []); setError(null); } catch (cause) { if (!controller.signal.aborted) setError(message(cause, "Could not evaluate readiness.")); } finally { if (!controller.signal.aborted) setLoading(false); } }, [feature.id, projectId, refreshKey, workspace.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); return () => { loadController.current?.abort(); actionController.current?.abort(); }; }, [load]);
  const run = async (kind: "preview" | "save") => { setPending(kind); setError(null); actionController.current?.abort(); const controller = new AbortController(); actionController.current = controller; try { const next = kind === "preview" ? await forgeApi.previewReadiness(workspace.id, projectId, feature.id, controller.signal) : await forgeApi.saveReadiness(workspace.id, projectId, feature.id, controller.signal); if (controller.signal.aborted) return; setPreview(next); if (kind === "save") setHistory((current) => [next, ...current]); } catch (cause) { if (!controller.signal.aborted) setError(message(cause, "Could not evaluate readiness.")); } finally { if (!controller.signal.aborted) setPending(null); } };
  const link = async () => { if (!selectedDecision) return; setPending("link"); try { await forgeApi.linkDecision(workspace.id, projectId, selectedDecision, feature.id); setSelectedDecision(""); await load(); } catch (cause) { setError(message(cause, "Could not link decision.")); } finally { setPending(null); } };
  const acknowledge = async (invariantId: string, expectedRevision: number) => { setPending(invariantId); try { await forgeApi.acknowledgeInvariant(workspace.id, projectId, feature.id, invariantId, expectedRevision); await load(); } catch (cause) { if (cause instanceof ApiError && cause.status === 409) { await load(); setError("This invariant changed before review. The current revision was loaded; review it and try again."); } else setError(message(cause, "Could not acknowledge invariant.")); } finally { setPending(null); } };
  const unlinked = useMemo(() => allDecisions.filter((item) => !decisions.some((linked) => linked.id === item.id && item.status !== "superseded")), [allDecisions, decisions]);
  if (loading) return <section className="detail-section readiness-panel"><LoadingPanel label="Loading readiness" /></section>;
  return <section className="detail-section readiness-panel" aria-label="Planning readiness"><div className="section-heading"><div><span className="eyebrow accent">PLANNING READINESS</span><h2>Readiness</h2></div><span className={`readiness-outcome ${preview?.outcome === "READY_TO_START" ? "ready" : "blocked"}`}>{preview?.outcome === "READY_TO_START" ? "READY TO START" : "NOT READY"}</span></div><p className="planning-disclaimer">Manual Feature Status is separate. READY TO START means planning rules pass; no implementation or delivery verification was performed.</p>{error && <p className="status-error" role="alert">{error}</p>}{preview && <><div className="readiness-current-note"><span className="mono-label">CURRENT PREVIEW</span><span>Recomputed from the current planning context. Preview does not create history.</span></div><div className="readiness-progress"><div><span>{preview.passed_checks.length} / {preview.results.length} rules passed</span><span>{preview.stale ? "STALE" : preview.rule_set_version}</span></div><div className="readiness-track"><span style={{ width: `${(preview.passed_checks.length / Math.max(preview.results.length, 1)) * 100}%` }} /></div></div><div className="readiness-rules">{preview.results.map((result) => <article className={`readiness-rule ${result.result}`} key={result.rule_id}><div><strong>{result.result === "passed" ? "PASS" : "BLOCKED"} · {result.rule_id}</strong><p>{result.explanation}</p></div>{result.blockers.map((blocker, blockerIndex) => <span className="readiness-blocker" key={`${result.rule_id}-${blocker.code}-${blockerIndex}`}>{blocker.message}</span>)}</article>)}</div><div className="detail-actions"><button className="button secondary" disabled={pending !== null} onClick={() => void run("preview")} type="button">{pending === "preview" ? "Evaluating..." : "Preview current"}</button><button className="button primary" disabled={pending !== null} onClick={() => void run("save")} type="button">{pending === "save" ? "Saving..." : "Evaluate & save"}</button></div></>}{<div className="readiness-support"><div><div className="section-heading"><h3>Linked decisions</h3><span>{decisions.length}</span></div>{decisions.length ? decisions.map((item) => <span className="status-chip neutral" key={item.id}>{item.title} · {item.status}</span>) : <p>No decisions linked. This does not fail readiness by itself.</p>}{unlinked.length > 0 && <div className="inline-link-form"><select aria-label="Decision to link" onChange={(event) => setSelectedDecision(event.target.value)} value={selectedDecision}><option value="">Link a decision</option>{unlinked.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button className="button secondary" disabled={!selectedDecision || pending !== null} onClick={() => void link()} type="button">{pending === "link" ? "Linking..." : "Link"}</button></div>}</div><div><div className="section-heading"><h3>Applicable invariants</h3><span>{invariants.length}</span></div>{invariants.length ? invariants.map((item) => <div className="readiness-invariant" key={item.id}><div className="readiness-invariant-copy"><strong>{item.title} · rev {item.revision}</strong><p>{item.statement}</p><small>Why: {item.rationale}</small></div>{item.needs_acknowledgement ? <button className="button ghost" disabled={pending !== null} onClick={() => void acknowledge(item.id, item.revision)} type="button">{pending === item.id ? "Reviewing..." : "Acknowledge review"}</button> : <small>Reviewed · not technical proof</small>}</div>) : <p>No active invariants apply.</p>}</div></div>}<div className="readiness-history"><div className="section-heading"><div><h3>Saved evaluation snapshots</h3><p>Snapshots remain unchanged; STALE means the current planning context has changed.</p></div><span>{history.length}</span></div>{history.length ? history.map((item) => <div className="history-row" key={item.evaluation_id}><span>{stamp(item.evaluated_at)}</span><strong>{item.outcome}</strong><span className={item.stale ? "history-stale" : ""}>{item.stale ? "STALE" : item.input_fingerprint.slice(0, 10)}</span></div>) : <p>No saved evaluations yet. Preview does not create history.</p>}</div><p className="planning-disclaimer">Delivery verification: not available in this milestone.</p></section>;
}
