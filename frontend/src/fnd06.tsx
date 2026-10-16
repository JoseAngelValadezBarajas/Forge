import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { forgeApi } from "./api";
import type {
  AcceptanceCriterion, ContextPackage, EvidenceRecord, Feature, GateEvaluation, ReleaseCandidateInput,
  GitObservation, Handoff, HandoffRevision, Project, ReleaseCandidate, ReleaseManifest, RepositoryConnection,
  VerificationEvaluation, VerificationRule, Workspace,
} from "./api";
import { ErrorPanel } from "./shared/ui/ErrorPanel";
import { LoadingPanel } from "./shared/ui/LoadingPanel";
import { PageFrame } from "./shared/ui/PageFrame";
import { formatDate } from "./shared/utils/formatDate";

type Opener = (button: HTMLButtonElement) => void;
type Loaded = {
  project: Project; features: Feature[]; criteria: AcceptanceCriterion[]; packages: ContextPackage[];
  evidence: EvidenceRecord[]; verifications: VerificationEvaluation[]; rules: VerificationRule[];
  candidates: ReleaseCandidate[]; handoffs: Handoff[]; handoffRevisions: HandoffRevision[];
  observations: { repository: RepositoryConnection; observation: GitObservation }[];
};

function Provenance({ value }: { value: string }) {
  return <span className={`status-chip ${value.toLowerCase()}`}>{value}</span>;
}

function ChecksTable({ gate }: { gate: GateEvaluation }) {
  return <div className="fnd06-check-list">{gate.checks.map((check) => <article className="fnd06-check" key={check.rule_id}>
    <div><span className="mono-label">{check.rule_id} · v{check.version}</span><h3>{check.explanation}</h3><p>{check.limitations.join(" ")}</p>{check.blockers.map((blocker) => <p className="form-error" key={blocker}>{blocker}</p>)}</div>
    <span className={`status-chip ${check.status.toLowerCase()}`}>{check.status}</span>
  </article>)}</div>;
}

function MultiSelect({ label, items, selected, onChange, getId, getLabel }: {
  label: string; items: { id: string }[]; selected: string[]; onChange: (next: string[]) => void;
  getId?: (item: { id: string }) => string; getLabel: (item: { id: string }) => string;
}) {
  const id = getId ?? ((item: { id: string }) => item.id);
  return <fieldset className="fnd06-multi"><legend>{label}</legend>{items.length ? items.map((item) => {
    const value = id(item);
    return <label className="fnd06-option" key={value}><input checked={selected.includes(value)} onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((entry) => entry !== value))} type="checkbox" /><span>{getLabel(item)}</span></label>;
  }) : <p className="muted-copy">No saved records available.</p>}</fieldset>;
}

export function Fnd06Page({ workspace, onOpenPalette }: { workspace: Workspace | null; onOpenPalette: Opener }) {
  const { projectId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [evidenceSearch, setEvidenceSearch] = useState("");
  const [evidenceStatus, setEvidenceStatus] = useState("ALL");
  const [evidenceProvenance, setEvidenceProvenance] = useState("ALL");
  const [evidenceSource, setEvidenceSource] = useState("ALL");

  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useEffect(() => {
    if (!workspace || !projectId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const [project, features, evidence, verifications, rules, candidates, handoffs, repositories] = await Promise.all([
          forgeApi.getProject(workspace.id, projectId, controller.signal),
          forgeApi.listFeatures(workspace.id, projectId, {}, controller.signal),
          forgeApi.listEvidence(workspace.id, projectId, controller.signal),
          forgeApi.listVerifications(workspace.id, projectId, controller.signal),
          forgeApi.listVerificationRules(workspace.id, projectId, controller.signal),
          forgeApi.listReleaseCandidates(workspace.id, projectId, controller.signal),
          forgeApi.listHandoffs(workspace.id, projectId, {}, controller.signal),
          forgeApi.listRepositories(workspace.id, projectId, controller.signal),
        ]);
        const [criteriaGroups, packageGroups, revisionGroups, observationGroups] = await Promise.all([
          Promise.all(features.map((feature) => forgeApi.listCriteria(workspace.id, projectId, feature.id, controller.signal))),
          Promise.all(features.map((feature) => forgeApi.listContextPackages(workspace.id, projectId, feature.id, controller.signal))),
          Promise.all(handoffs.map((handoff) => forgeApi.listHandoffRevisions(workspace.id, projectId, handoff.id, controller.signal))),
          Promise.all(repositories.map(async (repository) => (await forgeApi.listObservations(workspace.id, projectId, repository.id, controller.signal)).map((observation) => ({ repository, observation })))),
        ]);
        if (!controller.signal.aborted) {
          setData({ project, features, criteria: criteriaGroups.flat(), packages: packageGroups.flat(), evidence, verifications, rules, candidates, handoffs, handoffRevisions: revisionGroups.flat(), observations: observationGroups.flat() });
          setError(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load delivery records.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [workspace, projectId, refresh]);

  if (!workspace) return <PageFrame title="Delivery" subtitle="Select a Workspace to inspect evidence and release candidates." onOpenPalette={onOpenPalette}><div className="projects-empty"><h2>No Workspace selected</h2><p>Delivery records belong to a Project inside the active Workspace.</p></div></PageFrame>;
  if (loading) return <PageFrame title="Delivery" subtitle="Evidence, specific checks and release candidates." onOpenPalette={onOpenPalette}><LoadingPanel label="Loading delivery records" /></PageFrame>;
  if (error || !data) return <PageFrame title="Delivery" subtitle="Evidence, specific checks and release candidates." onOpenPalette={onOpenPalette}><ErrorPanel message={error ?? "Project data is unavailable."} onRetry={reload} /></PageFrame>;

  const base = `/projects/${projectId}/delivery`;
  const tail = location.pathname.slice(base.length).replace(/^\//, "");
  const evidenceId = tail.startsWith("evidence/") && !tail.endsWith("new") ? tail.split("/")[1] : undefined;
  const candidateId = tail.startsWith("release-candidates/") && !tail.endsWith("new") ? tail.split("/")[1] : undefined;
  const isNewEvidence = tail === "evidence/new";
  const isEvidence = tail === "evidence" || isNewEvidence || Boolean(evidenceId);
  const isVerification = tail === "verifications" || tail === "verifications/new" || tail.startsWith("verifications/");
  const isCandidate = tail.startsWith("release-candidates");
  const title = isEvidence ? evidenceId ? "Evidence detail" : isNewEvidence ? "Register evidence" : "Evidence inventory" : isVerification ? "Verification center" : isCandidate ? candidateId ? "Release candidate" : tail.endsWith("new") ? "Create release candidate" : "Release candidates" : "Delivery overview";
  const subtitle = isEvidence ? "Record source material and preserve how it was obtained." : isVerification ? "Run deterministic checks against saved Forge snapshots." : isCandidate ? "Freeze a deliberate scope, inspect gates and export its manifest." : "Understand evidence coverage before reviewing delivery readiness.";
  const changeMessage = (text: string) => { setMessage(text); setFormError(""); };
  const runMutation = async (operation: () => Promise<unknown>, success: string, then?: () => void) => {
    setPending(true); setFormError(""); setMessage("");
    try { await operation(); changeMessage(success); reload(); then?.(); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Forge could not complete this operation."); }
    finally { setPending(false); }
  };
  const nav = <nav aria-label="Delivery sections" className="detail-tabs fnd06-tabs">
    <Link className={`detail-tab${!isEvidence && !isVerification && !isCandidate ? " active" : ""}`} to={base}>Overview</Link>
    <Link className={`detail-tab${isEvidence ? " active" : ""}`} to={`${base}/evidence`}>Evidence</Link>
    <Link className={`detail-tab${isVerification ? " active" : ""}`} to={`${base}/verifications`}>Verifications</Link>
    <Link className={`detail-tab${isCandidate ? " active" : ""}`} to={`${base}/release-candidates`}>Release candidates</Link>
  </nav>;
  const archived = data.project.status === "archived";
  const workspaceBack = <Link className="button secondary" to={`/projects/${projectId}`}>Back to project</Link>;

  let content: ReactNode;
  if (!isEvidence && !isVerification && !isCandidate) {
    content = <>
      <section aria-label="Delivery summary" className="metric-grid fnd06-metrics">
        <Metric value={data.evidence.length} label="Evidence records" detail="Claims and saved observations" />
        <Metric value={data.verifications.length} label="Checks evaluated" detail="Snapshots, including stale results" />
        <Metric value={data.candidates.length} label="Release candidates" detail="Local planning records" />
        <Metric value={data.verifications.filter((item) => item.result === "BLOCKED" || item.result === "FAIL").length} label="Blocked checks" detail="Specific conditions unresolved" />
      </section>
      <div className="fnd06-overview-grid">
        <section className="form-panel"><div className="section-heading"><h2>Trust levels</h2><span>Declared separately</span></div><div className="fnd06-trust"><p><Provenance value="REPORTED" /> User-submitted claims and references.</p><p><Provenance value="OBSERVED" /> Metadata stored by Forge from a constrained local observer.</p><p><Provenance value="VERIFIED" /> Only the specific condition a named deterministic check evaluated.</p><p className="muted-copy">A Run marked completed, an acknowledged Handoff, a Git SHA, or a satisfied checkbox is not functional verification.</p></div></section>
        <section className="form-panel"><div className="section-heading"><h2>Release status</h2><span>{data.project.name}</span></div><p className="muted-copy">No delivery conclusion is inferred from missing records. A release candidate is a local snapshot and never means published.</p><Link className="button primary" to={`${base}/release-candidates`}>Inspect release candidates</Link></section>
      </div>
      <div className="section-heading"><h2>Recent evidence</h2><Link to={`${base}/evidence`}>View inventory →</Link></div>
      {data.evidence.length ? <EvidenceList items={data.evidence.slice(0, 6)} projectId={projectId} /> : <EmptyPanel title="No evidence recorded yet" description="Attach an explicit reference or a saved Forge record. Empty coverage is not reported as verified." action="Register evidence" to={`${base}/evidence/new`} />}
      {workspaceBack}
    </>;
  } else if (isEvidence) {
    const selectedEvidence = evidenceId ? data.evidence.find((item) => item.id === evidenceId) : null;
    const filteredEvidence = data.evidence.filter((item) => {
      const query = evidenceSearch.trim().toLocaleLowerCase();
      const matchesQuery = !query || `${item.title} ${item.description} ${item.declared_outcome ?? ""}`.toLocaleLowerCase().includes(query);
      return matchesQuery && (evidenceStatus === "ALL" || item.status === evidenceStatus) &&
        (evidenceProvenance === "ALL" || item.provenance === evidenceProvenance) &&
        (evidenceSource === "ALL" || item.source_kind === evidenceSource);
    });
    content = evidenceId ? selectedEvidence ? <section className="form-panel fnd06-detail">
      <div className="project-overview-header"><div><span className="eyebrow">{selectedEvidence.evidence_type.replaceAll("_", " ").toUpperCase()}</span><h2>{selectedEvidence.title}</h2><p>Recorded {formatDate(selectedEvidence.recorded_at)}</p></div><Provenance value={selectedEvidence.provenance} /></div>
      <dl className="fnd06-facts"><dt>Source kind</dt><dd>{selectedEvidence.source_kind}</dd><dt>Source reference</dt><dd>{selectedEvidence.source_reference ?? "No external reference"}</dd><dt>Feature</dt><dd>{data.features.find((item) => item.id === selectedEvidence.feature_id)?.readable_id ?? "Project-level"}</dd><dt>Criterion</dt><dd>{data.criteria.find((item) => item.id === selectedEvidence.acceptance_criterion_id)?.description ?? "Not linked"}</dd><dt>Declared outcome</dt><dd>{selectedEvidence.declared_outcome ?? "No outcome declared"}</dd><dt>State</dt><dd>{selectedEvidence.status}</dd></dl>
      <p>{selectedEvidence.description || "No description supplied."}</p><p className="fnd06-trust-note">This record does not become verified because of its type or declared outcome.</p>
      {!archived && selectedEvidence.status === "ACTIVE" && <button className="button secondary" disabled={pending} onClick={() => void runMutation(() => forgeApi.invalidateEvidence(workspace.id, projectId, selectedEvidence.id), "Evidence invalidated. Its record remains in history.")} type="button">Invalidate evidence</button>}
    </section> : <div className="projects-empty"><h2>Evidence not found</h2><p>This record may belong to a different Project.</p><Link className="button secondary" to={`${base}/evidence`}>Back to evidence</Link></div> : isNewEvidence ? <EvidenceForm data={data} archived={archived} pending={pending} error={formError} success={message} onSubmit={(payload) => runMutation(() => forgeApi.createEvidence(workspace.id, projectId, payload), "Evidence record saved with its assigned provenance.", () => navigate(`${base}/evidence`))} /> : <>
      <div className="section-heading"><h2>Evidence records</h2><Link aria-disabled={archived} className="button primary" to={`${base}/evidence/new`}>+ Register evidence</Link></div>
      <TrustDisclosure />
      <div className="fnd06-filter-row"><label>Search evidence<input aria-label="Search evidence" onChange={(event) => setEvidenceSearch(event.target.value)} placeholder="Title, description, outcome" value={evidenceSearch} /></label><label>Status<select aria-label="Evidence status filter" onChange={(event) => setEvidenceStatus(event.target.value)} value={evidenceStatus}><option value="ALL">All states</option><option value="ACTIVE">Active</option><option value="INVALIDATED">Invalidated</option><option value="SUPERSEDED">Superseded</option></select></label><label>Provenance<select aria-label="Evidence provenance filter" onChange={(event) => setEvidenceProvenance(event.target.value)} value={evidenceProvenance}><option value="ALL">All provenance</option><option value="REPORTED">Reported</option><option value="OBSERVED">Observed</option><option value="VERIFIED">Verified</option><option value="UNKNOWN">Unknown</option></select></label><label>Source<select aria-label="Evidence source filter" onChange={(event) => setEvidenceSource(event.target.value)} value={evidenceSource}><option value="ALL">All sources</option>{[...new Set(data.evidence.map((item) => item.source_kind))].sort().map((source) => <option key={source} value={source}>{source.replaceAll("_", " ")}</option>)}</select></label></div>
      {filteredEvidence.length ? <EvidenceList items={filteredEvidence} projectId={projectId} /> : <EmptyPanel title={data.evidence.length ? "No matching evidence" : "No evidence recorded yet"} description="Add a reference or explicitly select a saved Forge record. Forge will not download or inspect external URLs." action={data.evidence.length || archived ? undefined : "Register evidence"} to={`${base}/evidence/new`} />}
    </>;
  } else if (isVerification) {
    content = <>
      <div className="section-heading"><h2>Deterministic check library</h2><Link className="button primary" to={`${base}/verifications/new`}>+ New evaluation</Link></div>
      <div className="fnd06-rule-grid">{data.rules.map((rule) => <article className="fnd06-rule-card" key={rule.rule_id}><div><span className="mono-label">{rule.rule_id} · v{rule.version}</span><h3>{rule.title}</h3></div><span className={`status-chip ${rule.available ? "active" : "blocked"}`}>{rule.available ? "AVAILABLE" : "BLOCKED"}</span><p>{rule.limitation}</p></article>)}</div>
      {tail === "verifications/new" ? <VerificationForm data={data} archived={archived} pending={pending} error={formError} success={message} onPreview={(payload) => forgeApi.previewVerification(workspace.id, projectId, payload)} onEvaluate={(payload) => runMutation(() => forgeApi.evaluateVerification(workspace.id, projectId, payload), "Evaluation saved as an immutable snapshot.")} /> : <>
        <section className="form-panel"><div className="section-heading"><h2>Verification activity</h2><span>{data.verifications.length} snapshots</span></div>{data.verifications.length ? <div className="fnd06-list">{data.verifications.map((item) => <article className="fnd06-row" key={item.id}><div><span className="mono-label">{item.rule_id} · {item.rule_version} · {item.input_fingerprint.slice(0, 12)}</span><h3>{data.features.find((feature) => feature.id === item.feature_id)?.readable_id ?? "Project scope"} · {item.findings[0]}</h3><p>{item.evaluated_at ? formatDate(item.evaluated_at) : "Preview only"} · {item.stale ? "STALE" : "Historical snapshot preserved"}</p></div><span className={`status-chip ${item.stale ? "warning" : item.result.toLowerCase()}`}>{item.stale ? "STALE" : item.result}</span></article>)}</div> : <EmptyPanel title="No checks evaluated" description="Choose a supported deterministic rule to inspect saved Forge records. A report is not a verification." action="Configure a check" to={`${base}/verifications/new`} />}</section>
      </>}
    </>;
  } else {
    const selectedCandidate = candidateId ? data.candidates.find((item) => item.id === candidateId) : null;
    content = candidateId && selectedCandidate ? <CandidateDetail key={`${selectedCandidate.id}-${selectedCandidate.revision}`} candidate={selectedCandidate} data={data} dataRefresh={refresh} archived={archived} pending={pending} error={formError} success={message} gateWorkspaceId={workspace.id}
      onUpdate={(payload) => void runMutation(() => forgeApi.updateReleaseCandidate(workspace.id, projectId, selectedCandidate.id, { ...payload, expected_revision: selectedCandidate.revision }), "Candidate draft updated.")}
      onFreeze={() => void runMutation(() => forgeApi.freezeReleaseCandidate(workspace.id, projectId, selectedCandidate.id, selectedCandidate.revision), "Candidate frozen as an immutable snapshot.")}
      onEvaluate={() => void runMutation(() => forgeApi.evaluateReleaseGates(workspace.id, projectId, selectedCandidate.id), "Gate evaluation saved as an immutable snapshot.")}
      onSaveManifest={(gateId) => void runMutation(() => forgeApi.saveReleaseManifest(workspace.id, projectId, selectedCandidate.id, gateId), "Manifest snapshot saved.")} /> : tail.endsWith("new") ? <CandidateForm data={data} archived={archived} pending={pending} error={formError} success={message} onSubmit={(payload) => runMutation(async () => { const item = await forgeApi.createReleaseCandidate(workspace.id, projectId, payload); navigate(`${base}/release-candidates/${item.id}`); }, "Candidate draft saved.")} /> : <>
      <div className="section-heading"><h2>Release candidate archive</h2><Link className="button primary" to={`${base}/release-candidates/new`}>+ New candidate</Link></div>
      {data.candidates.length ? <div className="fnd06-list">{data.candidates.map((item) => <Link className="fnd06-row fnd06-link-row" key={item.id} to={`${base}/release-candidates/${item.id}`}><div><span className="mono-label">{item.candidate_key} · revision {item.revision}</span><h3>{item.title}</h3><p>{item.intended_version || "Version not specified"} · {item.status} · {item.content_fingerprint.slice(0, 12)}</p></div><span className={`status-chip ${item.status.toLowerCase()}`}>{item.status}</span></Link>)}</div> : <EmptyPanel title="No release candidates" description="Create a candidate to pin Features, Context Packages, evidence and verification snapshots." action={archived ? undefined : "Create candidate"} to={`${base}/release-candidates/new`} />}
      </>;
  }
  return <PageFrame title={title} subtitle={`${data.project.name} · ${subtitle}`} onOpenPalette={onOpenPalette}>
    {nav}
    {archived && <div className="feedback-panel fnd06-archived" role="status">This Project is archived. Delivery records remain readable; persistent mutations are disabled.</div>}
    {formError && !isEvidence && <p className="form-error" role="alert">{formError}</p>}
    {message && <p className="feedback-panel fnd06-success" role="status">{message}</p>}
    {content}
  </PageFrame>;
}

function Metric({ value, label, detail }: { value: number; label: string; detail: string }) {
  return <article className="metric-card"><span className="eyebrow">{label}</span><strong>{value}</strong><span>{detail}</span></article>;
}

function EmptyPanel({ title, description, action, to }: { title: string; description: string; action?: string; to: string }) {
  return <div className="projects-empty fnd06-empty"><span className="eyebrow">EMPTY EVIDENCE</span><h2>{title}</h2><p>{description}</p>{action && <Link className="button primary" to={to}>{action}</Link>}</div>;
}

function TrustDisclosure() {
  return <section className="fnd06-trust-callout"><strong>REPORTED is not VERIFIED</strong><p>References are stored without fetching them. A declaration or manual checkbox does not prove its claim.</p><span>No shell commands · no remote downloads · no arbitrary file paths</span></section>;
}

function EvidenceList({ items, projectId }: { items: EvidenceRecord[]; projectId: string }) {
  return <div className="fnd06-list">{items.map((item) => <Link className="fnd06-row fnd06-link-row" key={item.id} to={`/projects/${projectId}/delivery/evidence/${item.id}`}><div><span className="mono-label">{item.evidence_type.replaceAll("_", " ")} · {item.source_kind}</span><h3>{item.title}</h3><p>{item.feature_id ? "Feature linked" : "Project level"} · {item.status} · {formatDate(item.recorded_at)}</p></div><Provenance value={item.provenance} /></Link>)}</div>;
}

function EvidenceForm({ data, archived, pending, error, success, onSubmit }: {
  data: Loaded; archived: boolean; pending: boolean; error: string; success: string;
  onSubmit: (payload: { feature_id?: string; acceptance_criterion_id?: string; evidence_type: string; title: string; description: string; source_kind: string; source_reference?: string; declared_outcome?: string }) => void;
}) {
  const [featureId, setFeatureId] = useState("");
  const [criterionId, setCriterionId] = useState("");
  const [type, setType] = useState("document_reference");
  const [kind, setKind] = useState("safe_link");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [outcome, setOutcome] = useState("");
  const criteria = data.criteria.filter((item) => item.feature_id === featureId);
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit({ feature_id: featureId || undefined, acceptance_criterion_id: criterionId || undefined, evidence_type: type, title, description, source_kind: kind, source_reference: kind === "manual" ? undefined : reference, declared_outcome: outcome || undefined }); };
  return <form className="form-panel fnd06-form" onSubmit={submit}>
    <div className="section-heading"><h2>Describe the evidence</h2><span>Unverified unless evaluated</span></div>
    <label>Feature (optional)<select onChange={(event) => { setFeatureId(event.target.value); setCriterionId(""); }} value={featureId}><option value="">Project level</option>{data.features.map((item) => <option key={item.id} value={item.id}>{item.readable_id} · {item.title}</option>)}</select></label>
    <label>Acceptance criterion (optional)<select disabled={!featureId} onChange={(event) => setCriterionId(event.target.value)} value={criterionId}><option value="">Not linked</option>{criteria.map((item) => <option key={item.id} value={item.id}>{item.description}</option>)}</select></label>
    <label>Evidence type<select onChange={(event) => setType(event.target.value)} value={type}>{["reported_test_result", "document_reference", "artifact_reference", "git_observation_reference", "context_snapshot_reference", "handoff_revision_reference", "manual_attestation"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
    <label>Title<input maxLength={200} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
    <label>Description<textarea maxLength={10000} onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>
    <label>Source kind<select onChange={(event) => { setKind(event.target.value); setReference(""); }} value={kind}>{["safe_link", "artifact", "commit", "context_package", "git_observation", "handoff_revision", "manual"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
    {kind === "context_package" ? <label>Saved Context Package<select onChange={(event) => setReference(event.target.value)} required value={reference}><option value="">Choose a saved package</option>{data.packages.filter((item) => !featureId || item.feature_id === featureId).map((item) => <option key={item.id} value={item.id ?? ""}>{data.features.find((feature) => feature.id === item.feature_id)?.readable_id} · {item.fingerprint.slice(0, 12)}</option>)}</select></label>
      : kind === "git_observation" ? <label>Saved Git observation<select onChange={(event) => setReference(event.target.value)} required value={reference}><option value="">Choose an observation</option>{data.observations.map(({ repository, observation }) => <option key={observation.id} value={observation.id}>{repository.root_path.split(/[\\/]/).at(-1)} · {observation.head_sha?.slice(0, 12) ?? observation.status}</option>)}</select><span className="field-hint">The saved observation remains OBSERVED; no repository is read here.</span></label>
      : kind === "handoff_revision" ? <label>Saved Handoff revision<select onChange={(event) => setReference(event.target.value)} required value={reference}><option value="">Choose a revision</option>{data.handoffRevisions.filter((item) => !featureId || item.payload.feature_id === featureId).map((item) => <option key={item.id} value={item.id}>Revision {item.revision} · {item.fingerprint.slice(0, 12)}</option>)}</select></label>
      : kind !== "manual" && <label>Source reference<input maxLength={1000} onChange={(event) => setReference(event.target.value)} placeholder={kind === "safe_link" ? "https://…" : kind === "commit" ? "Hexadecimal commit ID" : "Opaque artifact identifier"} required value={reference} /></label>}
    <label>Declared outcome (optional)<input maxLength={5000} onChange={(event) => setOutcome(event.target.value)} value={outcome} /></label>
    <div className="fnd06-trust-callout"><strong>PROVENANCE: ASSIGNED BY SOURCE</strong><p>External references and manual attestations remain REPORTED. Saved Forge observations remain OBSERVED.</p><span>Forge will not fetch a URL or open an arbitrary path.</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}{success && <p role="status">{success}</p>}
    <div className="form-actions"><Link className="button secondary" to={`/projects/${data.project.id}/delivery/evidence`}>Cancel</Link><button className="button primary" disabled={archived || pending} type="submit">{pending ? "Saving…" : "Register evidence"}</button></div>
  </form>;
}

function VerificationForm({ data, archived, pending, error, success, onPreview, onEvaluate }: {
  data: Loaded; archived: boolean; pending: boolean; error: string; success: string;
  onPreview: (payload: { rule_id: string; feature_id?: string; context_package_id?: string; expected_digest?: string; handoff_revision_id?: string; evidence_ids?: string[] }) => Promise<VerificationEvaluation>;
  onEvaluate: (payload: { rule_id: string; feature_id?: string; context_package_id?: string; expected_digest?: string; handoff_revision_id?: string; evidence_ids?: string[] }) => void;
}) {
  const [ruleId, setRuleId] = useState("V02");
  const [featureId, setFeatureId] = useState("");
  const [contextId, setContextId] = useState("");
  const [handoffId, setHandoffId] = useState("");
  const [expectedDigest, setExpectedDigest] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<VerificationEvaluation | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewPending, setPreviewPending] = useState(false);
  const rule = data.rules.find((item) => item.rule_id === ruleId);
  const payload = { rule_id: ruleId, feature_id: featureId || undefined, context_package_id: contextId || undefined, expected_digest: expectedDigest || undefined, handoff_revision_id: handoffId || undefined, evidence_ids: evidenceIds };
  return <section className="form-panel fnd06-form"><div className="section-heading"><h2>Configure verification check</h2><span>Fail closed</span></div>
    <label>Rule<select onChange={(event) => { setRuleId(event.target.value); setContextId(""); setHandoffId(""); setEvidenceIds([]); }} value={ruleId}>{data.rules.map((item) => <option key={item.rule_id} value={item.rule_id}>{item.rule_id} · {item.title}{item.available ? "" : " (blocked)"}</option>)}</select></label>
    {(ruleId === "V02" || ruleId === "V04") && <label>Feature<select onChange={(event) => setFeatureId(event.target.value)} value={featureId}><option value="">Choose a Feature</option>{data.features.map((item) => <option key={item.id} value={item.id}>{item.readable_id} · {item.title}</option>)}</select></label>}
    {ruleId === "V02" && <label>Saved Context Package<select onChange={(event) => setContextId(event.target.value)} value={contextId}><option value="">Choose a saved package</option>{data.packages.filter((item) => !featureId || item.feature_id === featureId).map((item) => <option key={item.id} value={item.id ?? ""}>{item.fingerprint.slice(0, 16)} · {item.schema_version}</option>)}</select></label>}
    {ruleId === "V02" && <label>Expected SHA-256<input maxLength={64} onChange={(event) => setExpectedDigest(event.target.value)} placeholder="Defaults to saved fingerprint" value={expectedDigest} /></label>}
    {ruleId === "V03" && <label>Saved Handoff revision<select onChange={(event) => setHandoffId(event.target.value)} value={handoffId}><option value="">Choose a revision</option>{data.handoffRevisions.map((item) => <option key={item.id} value={item.id}>r{item.revision} · {item.fingerprint.slice(0, 16)}</option>)}</select></label>}
    {ruleId === "V04" && <MultiSelect items={data.evidence.filter((item) => item.status === "ACTIVE" && (!featureId || item.feature_id === featureId || item.feature_id === null))} selected={evidenceIds} onChange={setEvidenceIds} label="Evidence Records" getLabel={(item) => `${(item as EvidenceRecord).title} · ${(item as EvidenceRecord).provenance}`} />}
    <div className="fnd06-trust-callout"><strong>{rule?.available ? "SCOPED PROOF" : "RULE UNSUPPORTED"}</strong><p>{rule?.limitation}</p><span>Inputs are persisted snapshots; no shell or network access occurs.</span></div>
    {previewError && <p className="form-error" role="alert">{previewError}</p>}{preview && <div className="fnd06-preview" role="status"><span className={`status-chip ${preview.result.toLowerCase()}`}>{preview.result}</span><p>{preview.findings.join(" ")}</p><span className="mono-label">Input fingerprint · {preview.input_fingerprint}</span></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{success && <p role="status">{success}</p>}
    <div className="form-actions"><button className="button secondary" disabled={pending || previewPending} onClick={() => { setPreviewError(""); setPreviewPending(true); void onPreview(payload).then(setPreview).catch((cause: unknown) => setPreviewError(cause instanceof Error ? cause.message : "Preview failed.")).finally(() => setPreviewPending(false)); }} type="button">{previewPending ? "Previewing…" : "Preview"}</button><button className="button primary" disabled={archived || pending || previewPending || !rule?.available} onClick={() => onEvaluate(payload)} type="button">{pending ? "Evaluating…" : "Evaluate & Save"}</button></div>
  </section>;
}

function CandidateForm({ data, archived, pending, error, success, onSubmit }: {
  data: Loaded; archived: boolean; pending: boolean; error: string; success: string;
  onSubmit: (payload: { title: string; intended_version?: string; description?: string; feature_ids: string[]; context_package_ids: string[]; evidence_ids: string[]; verification_ids: string[]; handoff_revision_ids: string[] }) => void;
}) {
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [verificationIds, setVerificationIds] = useState<string[]>([]);
  const [handoffIds, setHandoffIds] = useState<string[]>([]);
  const selectedEvidence = data.evidence.filter((item) => !item.feature_id || featureIds.includes(item.feature_id));
  const selectedVerifications = data.verifications.filter((item) => !item.feature_id || featureIds.includes(item.feature_id));
  return <section className="form-panel fnd06-form"><div className="section-heading"><h2>Create release candidate</h2><span>No release actions</span></div>
    <label>Candidate label<input onChange={(event) => setTitle(event.target.value)} required value={title} /></label><label>Intended version (optional)<input onChange={(event) => setVersion(event.target.value)} placeholder="For example, 0.1.0" value={version} /></label><label>Description<textarea onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>
    <MultiSelect label="Included Features" items={data.features} selected={featureIds} onChange={(next) => { setFeatureIds(next); setPackageIds([]); }} getLabel={(item) => `${(item as Feature).readable_id} · ${(item as Feature).title}`} />
    <MultiSelect label="Pinned Context Packages" items={data.packages.filter((item): item is ContextPackage & { id: string } => featureIds.includes(item.feature_id) && Boolean(item.id))} selected={packageIds} onChange={setPackageIds} getLabel={(item) => `${(item as ContextPackage).fingerprint.slice(0, 16)} · ${(item as ContextPackage).schema_version}`} />
    <MultiSelect label="Selected Evidence" items={selectedEvidence} selected={evidenceIds} onChange={setEvidenceIds} getLabel={(item) => `${(item as EvidenceRecord).title} · ${(item as EvidenceRecord).status}`} />
    <MultiSelect label="Verification snapshots" items={selectedVerifications.filter((item): item is VerificationEvaluation & { id: string } => Boolean(item.id))} selected={verificationIds} onChange={setVerificationIds} getLabel={(item) => `${(item as VerificationEvaluation).rule_id} · ${(item as VerificationEvaluation).result} · ${(item as VerificationEvaluation).input_fingerprint.slice(0, 10)}`} />
    <MultiSelect label="Published Handoff revisions (optional)" items={data.handoffRevisions.filter((item) => data.handoffs.some((handoff) => handoff.id === item.handoff_id && featureIds.includes(handoff.feature_id)))} selected={handoffIds} onChange={setHandoffIds} getLabel={(item) => `Revision ${(item as HandoffRevision).revision} · ${(item as HandoffRevision).fingerprint.slice(0, 12)}`} />
    <div className="fnd06-trust-callout"><strong>SNAPSHOT NOTICE</strong><p>Selections are pinned by identifier and fingerprint. Every acceptance criterion requires linked active documentary evidence for the corresponding gate.</p><span>Creating a candidate does not mark Features done, create Git tags or publish a release.</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}{success && <p role="status">{success}</p>}
    <div className="form-actions"><Link className="button secondary" to={`/projects/${data.project.id}/delivery/release-candidates`}>Cancel</Link><button className="button primary" disabled={archived || pending || !featureIds.length} onClick={() => onSubmit({ title, intended_version: version || undefined, description, feature_ids: featureIds, context_package_ids: packageIds, evidence_ids: evidenceIds, verification_ids: verificationIds, handoff_revision_ids: handoffIds })} type="button">{pending ? "Saving…" : "Create candidate"}</button></div>
  </section>;
}

function CandidateDetail({ candidate, data, dataRefresh, archived, pending, error, success, gateWorkspaceId, onUpdate, onFreeze, onEvaluate, onSaveManifest }: {
  candidate: ReleaseCandidate; data: Loaded; dataRefresh: number; archived: boolean; pending: boolean; error: string; success: string;
  gateWorkspaceId: string; onUpdate: (payload: ReleaseCandidateInput) => void; onFreeze: () => void; onEvaluate: () => void; onSaveManifest: (gateId: string) => void;
}) {
  const { projectId = "" } = useParams();
  const [gate, setGate] = useState<GateEvaluation | null>(null);
  const [history, setHistory] = useState<GateEvaluation[]>([]);
  const [manifest, setManifest] = useState<ReleaseManifest | null>(null);
  const [loading, setLoading] = useState(candidate.status === "FROZEN");
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState(candidate.title);
  const [version, setVersion] = useState(candidate.intended_version ?? "");
  const [description, setDescription] = useState(candidate.description);
  const [featureIds, setFeatureIds] = useState(candidate.selection.feature_ids);
  const [packageIds, setPackageIds] = useState(candidate.selection.context_package_ids);
  const [evidenceIds, setEvidenceIds] = useState(candidate.selection.evidence_ids);
  const [verificationIds, setVerificationIds] = useState(candidate.selection.verification_ids);
  const [handoffIds, setHandoffIds] = useState(candidate.selection.handoff_revision_ids);
  useEffect(() => {
    if (candidate.status !== "FROZEN") return;
    const controller = new AbortController();
    void Promise.all([
      forgeApi.previewReleaseGates(gateWorkspaceId, projectId, candidate.id, controller.signal),
      forgeApi.listReleaseGateHistory(gateWorkspaceId, projectId, candidate.id, controller.signal),
      forgeApi.getReleaseManifest(gateWorkspaceId, projectId, candidate.id, controller.signal).catch(() => null),
    ]).then(([current, rows, saved]) => { if (!controller.signal.aborted) { setGate(current); setHistory(rows); setManifest(saved); setLoadError(""); } }).catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Could not load candidate history."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [candidate.id, candidate.status, candidate.revision, gateWorkspaceId, projectId, candidate.content_fingerprint, dataRefresh]);
  const selections = candidate.selection;
  const candidateInput: ReleaseCandidateInput = {
    title, intended_version: version || undefined, description,
    feature_ids: featureIds, context_package_ids: packageIds, evidence_ids: evidenceIds,
    verification_ids: verificationIds, handoff_revision_ids: handoffIds,
  };
  const draftDirty = title !== candidate.title || version !== (candidate.intended_version ?? "") || description !== candidate.description ||
    JSON.stringify(candidateInput.feature_ids) !== JSON.stringify(selections.feature_ids) ||
    JSON.stringify(candidateInput.context_package_ids) !== JSON.stringify(selections.context_package_ids) ||
    JSON.stringify(candidateInput.evidence_ids) !== JSON.stringify(selections.evidence_ids) ||
    JSON.stringify(candidateInput.verification_ids) !== JSON.stringify(selections.verification_ids) ||
    JSON.stringify(candidateInput.handoff_revision_ids) !== JSON.stringify(selections.handoff_revision_ids);
  const gateLoading = candidate.status === "FROZEN" && loading && !gate;
  const currentSavedGate = gate && history.find((item) => item.id && !item.stale && item.input_fingerprint === gate.input_fingerprint);
  const downloadUrl = (format: "json" | "markdown") => `/api/workspaces/${gateWorkspaceId}/projects/${projectId}/release-candidates/${candidate.id}/manifest/download?format=${format}${manifest ? `&manifest_id=${manifest.id}` : ""}`;
  return <>
    <section className="form-panel"><div className="project-overview-header"><div><span className="eyebrow">{candidate.candidate_key} · REVISION {candidate.revision}</span><h2>{candidate.title}</h2><p>{candidate.intended_version ?? "Intended version not set"} · {candidate.status}</p></div><span className={`status-chip ${candidate.status.toLowerCase()}`}>{candidate.status}</span></div><p className="mono-label">Fingerprint · {candidate.content_fingerprint}</p>
      <div className="fnd06-scope-grid"><ScopeCount title="Features" ids={selections.feature_ids} labels={data.features.map((item) => ({ id: item.id, label: `${item.readable_id} · ${item.title}` }))} /><ScopeCount title="Context Packages" ids={selections.context_package_ids} labels={data.packages.map((item) => ({ id: item.id ?? "", label: item.fingerprint.slice(0, 16) }))} /><ScopeCount title="Evidence" ids={selections.evidence_ids} labels={data.evidence.map((item) => ({ id: item.id, label: item.title }))} /><ScopeCount title="Verifications" ids={selections.verification_ids} labels={data.verifications.map((item) => ({ id: item.id ?? "", label: `${item.rule_id} · ${item.result}` }))} /></div>
      {candidate.snapshot && <details className="fnd06-snapshot"><summary>Inspect frozen snapshot</summary><pre>{JSON.stringify(candidate.snapshot, null, 2)}</pre></details>}
      {candidate.status === "DRAFT" ? <>
        <section aria-label="Edit release candidate draft" className="form-panel fnd06-form">
          <h3>Edit candidate draft</h3>
          <label>Candidate title<input maxLength={200} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
          <label>Intended version<input maxLength={80} onChange={(event) => setVersion(event.target.value)} value={version} /></label>
          <label>Description<textarea maxLength={10000} onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>
          <MultiSelect label="Included Features" items={data.features} selected={featureIds} onChange={(next) => {
            setFeatureIds(next);
            setPackageIds((current) => current.filter((id) => data.packages.some((item) => item.id === id && next.includes(item.feature_id))));
            setEvidenceIds((current) => current.filter((id) => data.evidence.some((item) => item.id === id && (!item.feature_id || next.includes(item.feature_id)))));
            setVerificationIds((current) => current.filter((id) => data.verifications.some(
              (item) => item.id === id && (!item.feature_id || next.includes(item.feature_id)),
            )));
            setHandoffIds((current) => current.filter((id) => data.handoffs.some((handoff) => data.handoffRevisions.some((revision) => revision.id === id && revision.handoff_id === handoff.id) && next.includes(handoff.feature_id))));
          }} getLabel={(item) => `${(item as Feature).readable_id} · ${(item as Feature).title}`} />
          <MultiSelect label="Pinned Context Packages" items={data.packages.filter((item): item is ContextPackage & { id: string } => featureIds.includes(item.feature_id) && Boolean(item.id))} selected={packageIds} onChange={setPackageIds} getLabel={(item) => `${(item as ContextPackage).fingerprint.slice(0, 16)} · ${(item as ContextPackage).schema_version}`} />
          <MultiSelect label="Selected Evidence" items={data.evidence.filter((item) => !item.feature_id || featureIds.includes(item.feature_id))} selected={evidenceIds} onChange={setEvidenceIds} getLabel={(item) => `${(item as EvidenceRecord).title} · ${(item as EvidenceRecord).status}`} />
          <MultiSelect label="Verification snapshots" items={data.verifications.filter((item): item is VerificationEvaluation & { id: string } => Boolean(item.id) && (!item.feature_id || featureIds.includes(item.feature_id)))} selected={verificationIds} onChange={setVerificationIds} getLabel={(item) => `${(item as VerificationEvaluation).rule_id} · ${(item as VerificationEvaluation).result}`} />
          <MultiSelect label="Published Handoff revisions" items={data.handoffRevisions.filter((item) => data.handoffs.some((handoff) => handoff.id === item.handoff_id && featureIds.includes(handoff.feature_id)))} selected={handoffIds} onChange={setHandoffIds} getLabel={(item) => `Revision ${(item as HandoffRevision).revision} · ${(item as HandoffRevision).fingerprint.slice(0, 12)}`} />
          <button className="button secondary" disabled={archived || pending || !draftDirty || !title.trim() || featureIds.length === 0} onClick={() => onUpdate(candidateInput)} type="button">{pending ? "Saving draft…" : "Save draft changes"}</button>
        </section>
        <button className="button primary" disabled={archived || pending || draftDirty} onClick={onFreeze} type="button">Freeze candidate snapshot</button>
      </> : <button className="button primary" disabled={archived || pending} onClick={onEvaluate} type="button">{pending ? "Evaluating…" : "Evaluate release gates"}</button>}
      <p className="fnd06-trust-note">A candidate is not a published release. Freeze preserves a snapshot; subsequent changes require a new candidate.</p>
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="feedback-panel fnd06-success" role="status">{success}</p>}
    {candidate.status === "FROZEN" && (gateLoading ? <LoadingPanel label="Loading gate preview" /> : loadError ? <p className="form-error" role="alert">{loadError}</p> : gate && <>
      <section className="form-panel"><div className="section-heading"><h2>Release gate evaluation</h2><span className={`status-chip ${gate.result.toLowerCase()}`}>{gate.stale ? "STALE" : gate.result}</span></div><p className="muted-copy">Gate result is limited to ruleset {gate.ruleset_version}. It does not establish functional completeness or publication.</p><ChecksTable gate={gate} />
        {currentSavedGate?.id && <button className="button secondary" disabled={pending || archived} onClick={() => onSaveManifest(currentSavedGate.id!)} type="button">Generate &amp; save manifest</button>}
        {manifest && <div className="fnd06-downloads"><strong>Saved {manifest.schema_version}</strong><span>{manifest.fingerprint}</span><a className="button secondary" href={downloadUrl("json")}>Download JSON</a><a className="button secondary" href={downloadUrl("markdown")}>Download Markdown</a><span className="status-chip neutral">NOT PUBLISHED</span></div>}
      </section>
      <section className="form-panel"><div className="section-heading"><h2>Immutable gate history</h2><span>{history.length} evaluations</span></div>{history.length ? history.map((item) => <div className="fnd06-history-row" key={item.id}><span>{item.evaluated_at ? formatDate(item.evaluated_at) : "Saved evaluation"}</span><span className="mono-label">{item.ruleset_version} · {item.input_fingerprint.slice(0, 16)}</span><span className={`status-chip ${(item.stale ? "warning" : item.stored_result ?? item.result).toLowerCase()}`}>{item.stale ? "STALE" : item.stored_result ?? item.result}</span></div>) : <p className="muted-copy">No saved gate evaluation yet. Preview updates as selected inputs change.</p>}</section>
    </>)}
  </>;
}

function ScopeCount({ title, ids, labels }: { title: string; ids: string[]; labels: { id: string; label: string }[] }) {
  const byId = useMemo(() => new Map(labels.map((item) => [item.id, item.label])), [labels]);
  return <div><span className="eyebrow">{title} · {ids.length}</span>{ids.length ? <ul>{ids.map((id) => <li key={id}>{byId.get(id) ?? id}</li>)}</ul> : <p className="muted-copy">None pinned</p>}</div>;
}
