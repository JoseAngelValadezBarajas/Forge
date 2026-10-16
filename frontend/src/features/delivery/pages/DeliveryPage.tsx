import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { forgeApi } from "../../../api";
import type { Workspace } from "../../../api";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { formatDate } from "../../../shared/utils/formatDate";
import { type Loaded } from "../types";
import { Metric } from "../components/Metric";
import { Provenance } from "../components/Provenance";
import { EvidenceList } from "../evidence/EvidenceList";
import { EmptyPanel } from "../components/EmptyPanel";
import { EvidenceForm } from "../evidence/EvidenceForm";
import { TrustDisclosure } from "../components/TrustDisclosure";
import { VerificationForm } from "../verification/VerificationForm";
import { CandidateDetail } from "../releases/CandidateDetail";
import { CandidateForm } from "../releases/CandidateForm";

type Opener = (button: HTMLButtonElement) => void;

export function DeliveryPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: Opener;
}) {
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
        const [
          project,
          features,
          evidence,
          verifications,
          rules,
          candidates,
          handoffs,
          repositories,
        ] = await Promise.all([
          forgeApi.getProject(workspace.id, projectId, controller.signal),
          forgeApi.listFeatures(workspace.id, projectId, {}, controller.signal),
          forgeApi.listEvidence(workspace.id, projectId, controller.signal),
          forgeApi.listVerifications(
            workspace.id,
            projectId,
            controller.signal,
          ),
          forgeApi.listVerificationRules(
            workspace.id,
            projectId,
            controller.signal,
          ),
          forgeApi.listReleaseCandidates(
            workspace.id,
            projectId,
            controller.signal,
          ),
          forgeApi.listHandoffs(workspace.id, projectId, {}, controller.signal),
          forgeApi.listRepositories(workspace.id, projectId, controller.signal),
        ]);
        const [
          criteriaGroups,
          packageGroups,
          revisionGroups,
          observationGroups,
        ] = await Promise.all([
          Promise.all(
            features.map((feature) =>
              forgeApi.listCriteria(
                workspace.id,
                projectId,
                feature.id,
                controller.signal,
              ),
            ),
          ),
          Promise.all(
            features.map((feature) =>
              forgeApi.listContextPackages(
                workspace.id,
                projectId,
                feature.id,
                controller.signal,
              ),
            ),
          ),
          Promise.all(
            handoffs.map((handoff) =>
              forgeApi.listHandoffRevisions(
                workspace.id,
                projectId,
                handoff.id,
                controller.signal,
              ),
            ),
          ),
          Promise.all(
            repositories.map(async (repository) =>
              (
                await forgeApi.listObservations(
                  workspace.id,
                  projectId,
                  repository.id,
                  controller.signal,
                )
              ).map((observation) => ({ repository, observation })),
            ),
          ),
        ]);
        if (!controller.signal.aborted) {
          setData({
            project,
            features,
            criteria: criteriaGroups.flat(),
            packages: packageGroups.flat(),
            evidence,
            verifications,
            rules,
            candidates,
            handoffs,
            handoffRevisions: revisionGroups.flat(),
            observations: observationGroups.flat(),
          });
          setError(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load delivery records.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [workspace, projectId, refresh]);

  if (!workspace)
    return (
      <PageFrame
        title="Delivery"
        subtitle="Select a Workspace to inspect evidence and release candidates."
        onOpenPalette={onOpenPalette}
      >
        <div className="projects-empty">
          <h2>No Workspace selected</h2>
          <p>
            Delivery records belong to a Project inside the active Workspace.
          </p>
        </div>
      </PageFrame>
    );
  if (loading)
    return (
      <PageFrame
        title="Delivery"
        subtitle="Evidence, specific checks and release candidates."
        onOpenPalette={onOpenPalette}
      >
        <LoadingPanel label="Loading delivery records" />
      </PageFrame>
    );
  if (error || !data)
    return (
      <PageFrame
        title="Delivery"
        subtitle="Evidence, specific checks and release candidates."
        onOpenPalette={onOpenPalette}
      >
        <ErrorPanel
          message={error ?? "Project data is unavailable."}
          onRetry={reload}
        />
      </PageFrame>
    );

  const base = `/projects/${projectId}/delivery`;
  const tail = location.pathname.slice(base.length).replace(/^\//, "");
  const evidenceId =
    tail.startsWith("evidence/") && !tail.endsWith("new")
      ? tail.split("/")[1]
      : undefined;
  const candidateId =
    tail.startsWith("release-candidates/") && !tail.endsWith("new")
      ? tail.split("/")[1]
      : undefined;
  const isNewEvidence = tail === "evidence/new";
  const isEvidence =
    tail === "evidence" || isNewEvidence || Boolean(evidenceId);
  const isVerification =
    tail === "verifications" ||
    tail === "verifications/new" ||
    tail.startsWith("verifications/");
  const isCandidate = tail.startsWith("release-candidates");
  const title = isEvidence
    ? evidenceId
      ? "Evidence detail"
      : isNewEvidence
        ? "Register evidence"
        : "Evidence inventory"
    : isVerification
      ? "Verification center"
      : isCandidate
        ? candidateId
          ? "Release candidate"
          : tail.endsWith("new")
            ? "Create release candidate"
            : "Release candidates"
        : "Delivery overview";
  const subtitle = isEvidence
    ? "Record source material and preserve how it was obtained."
    : isVerification
      ? "Run deterministic checks against saved Forge snapshots."
      : isCandidate
        ? "Freeze a deliberate scope, inspect gates and export its manifest."
        : "Understand evidence coverage before reviewing delivery readiness.";
  const changeMessage = (text: string) => {
    setMessage(text);
    setFormError("");
  };
  const runMutation = async (
    operation: () => Promise<unknown>,
    success: string,
    then?: () => void,
  ) => {
    setPending(true);
    setFormError("");
    setMessage("");
    try {
      await operation();
      changeMessage(success);
      reload();
      then?.();
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Forge could not complete this operation.",
      );
    } finally {
      setPending(false);
    }
  };
  const nav = (
    <nav aria-label="Delivery sections" className="detail-tabs fnd06-tabs">
      <Link
        className={`detail-tab${!isEvidence && !isVerification && !isCandidate ? " active" : ""}`}
        to={base}
      >
        Overview
      </Link>
      <Link
        className={`detail-tab${isEvidence ? " active" : ""}`}
        to={`${base}/evidence`}
      >
        Evidence
      </Link>
      <Link
        className={`detail-tab${isVerification ? " active" : ""}`}
        to={`${base}/verifications`}
      >
        Verifications
      </Link>
      <Link
        className={`detail-tab${isCandidate ? " active" : ""}`}
        to={`${base}/release-candidates`}
      >
        Release candidates
      </Link>
    </nav>
  );
  const archived = data.project.status === "archived";
  const workspaceBack = (
    <Link className="button secondary" to={`/projects/${projectId}`}>
      Back to project
    </Link>
  );

  let content: ReactNode;
  if (!isEvidence && !isVerification && !isCandidate) {
    content = (
      <>
        <section
          aria-label="Delivery summary"
          className="metric-grid fnd06-metrics"
        >
          <Metric
            value={data.evidence.length}
            label="Evidence records"
            detail="Claims and saved observations"
          />
          <Metric
            value={data.verifications.length}
            label="Checks evaluated"
            detail="Snapshots, including stale results"
          />
          <Metric
            value={data.candidates.length}
            label="Release candidates"
            detail="Local planning records"
          />
          <Metric
            value={
              data.verifications.filter(
                (item) => item.result === "BLOCKED" || item.result === "FAIL",
              ).length
            }
            label="Blocked checks"
            detail="Specific conditions unresolved"
          />
        </section>
        <div className="fnd06-overview-grid">
          <section className="form-panel">
            <div className="section-heading">
              <h2>Trust levels</h2>
              <span>Declared separately</span>
            </div>
            <div className="fnd06-trust">
              <p>
                <Provenance value="REPORTED" /> User-submitted claims and
                references.
              </p>
              <p>
                <Provenance value="OBSERVED" /> Metadata stored by Forge from a
                constrained local observer.
              </p>
              <p>
                <Provenance value="VERIFIED" /> Only the specific condition a
                named deterministic check evaluated.
              </p>
              <p className="muted-copy">
                A Run marked completed, an acknowledged Handoff, a Git SHA, or a
                satisfied checkbox is not functional verification.
              </p>
            </div>
          </section>
          <section className="form-panel">
            <div className="section-heading">
              <h2>Release status</h2>
              <span>{data.project.name}</span>
            </div>
            <p className="muted-copy">
              No delivery conclusion is inferred from missing records. A release
              candidate is a local snapshot and never means published.
            </p>
            <Link className="button primary" to={`${base}/release-candidates`}>
              Inspect release candidates
            </Link>
          </section>
        </div>
        <div className="section-heading">
          <h2>Recent evidence</h2>
          <Link to={`${base}/evidence`}>View inventory →</Link>
        </div>
        {data.evidence.length ? (
          <EvidenceList
            items={data.evidence.slice(0, 6)}
            projectId={projectId}
          />
        ) : (
          <EmptyPanel
            title="No evidence recorded yet"
            description="Attach an explicit reference or a saved Forge record. Empty coverage is not reported as verified."
            action="Register evidence"
            to={`${base}/evidence/new`}
          />
        )}
        {workspaceBack}
      </>
    );
  } else if (isEvidence) {
    const selectedEvidence = evidenceId
      ? data.evidence.find((item) => item.id === evidenceId)
      : null;
    const filteredEvidence = data.evidence.filter((item) => {
      const query = evidenceSearch.trim().toLocaleLowerCase();
      const matchesQuery =
        !query ||
        `${item.title} ${item.description} ${item.declared_outcome ?? ""}`
          .toLocaleLowerCase()
          .includes(query);
      return (
        matchesQuery &&
        (evidenceStatus === "ALL" || item.status === evidenceStatus) &&
        (evidenceProvenance === "ALL" ||
          item.provenance === evidenceProvenance) &&
        (evidenceSource === "ALL" || item.source_kind === evidenceSource)
      );
    });
    content = evidenceId ? (
      selectedEvidence ? (
        <section className="form-panel fnd06-detail">
          <div className="project-overview-header">
            <div>
              <span className="eyebrow">
                {selectedEvidence.evidence_type
                  .replaceAll("_", " ")
                  .toUpperCase()}
              </span>
              <h2>{selectedEvidence.title}</h2>
              <p>Recorded {formatDate(selectedEvidence.recorded_at)}</p>
            </div>
            <Provenance value={selectedEvidence.provenance} />
          </div>
          <dl className="fnd06-facts">
            <dt>Source kind</dt>
            <dd>{selectedEvidence.source_kind}</dd>
            <dt>Source reference</dt>
            <dd>
              {selectedEvidence.source_reference ?? "No external reference"}
            </dd>
            <dt>Feature</dt>
            <dd>
              {data.features.find(
                (item) => item.id === selectedEvidence.feature_id,
              )?.readable_id ?? "Project-level"}
            </dd>
            <dt>Criterion</dt>
            <dd>
              {data.criteria.find(
                (item) => item.id === selectedEvidence.acceptance_criterion_id,
              )?.description ?? "Not linked"}
            </dd>
            <dt>Declared outcome</dt>
            <dd>
              {selectedEvidence.declared_outcome ?? "No outcome declared"}
            </dd>
            <dt>State</dt>
            <dd>{selectedEvidence.status}</dd>
          </dl>
          <p>{selectedEvidence.description || "No description supplied."}</p>
          <p className="fnd06-trust-note">
            This record does not become verified because of its type or declared
            outcome.
          </p>
          {!archived && selectedEvidence.status === "ACTIVE" && (
            <button
              className="button secondary"
              disabled={pending}
              onClick={() =>
                void runMutation(
                  () =>
                    forgeApi.invalidateEvidence(
                      workspace.id,
                      projectId,
                      selectedEvidence.id,
                    ),
                  "Evidence invalidated. Its record remains in history.",
                )
              }
              type="button"
            >
              Invalidate evidence
            </button>
          )}
        </section>
      ) : (
        <div className="projects-empty">
          <h2>Evidence not found</h2>
          <p>This record may belong to a different Project.</p>
          <Link className="button secondary" to={`${base}/evidence`}>
            Back to evidence
          </Link>
        </div>
      )
    ) : isNewEvidence ? (
      <EvidenceForm
        data={data}
        archived={archived}
        pending={pending}
        error={formError}
        success={message}
        onSubmit={(payload) =>
          runMutation(
            () => forgeApi.createEvidence(workspace.id, projectId, payload),
            "Evidence record saved with its assigned provenance.",
            () => navigate(`${base}/evidence`),
          )
        }
      />
    ) : (
      <>
        <div className="section-heading">
          <h2>Evidence records</h2>
          <Link
            aria-disabled={archived}
            className="button primary"
            to={`${base}/evidence/new`}
          >
            + Register evidence
          </Link>
        </div>
        <TrustDisclosure />
        <div className="fnd06-filter-row">
          <label>
            Search evidence
            <input
              aria-label="Search evidence"
              onChange={(event) => setEvidenceSearch(event.target.value)}
              placeholder="Title, description, outcome"
              value={evidenceSearch}
            />
          </label>
          <label>
            Status
            <select
              aria-label="Evidence status filter"
              onChange={(event) => setEvidenceStatus(event.target.value)}
              value={evidenceStatus}
            >
              <option value="ALL">All states</option>
              <option value="ACTIVE">Active</option>
              <option value="INVALIDATED">Invalidated</option>
              <option value="SUPERSEDED">Superseded</option>
            </select>
          </label>
          <label>
            Provenance
            <select
              aria-label="Evidence provenance filter"
              onChange={(event) => setEvidenceProvenance(event.target.value)}
              value={evidenceProvenance}
            >
              <option value="ALL">All provenance</option>
              <option value="REPORTED">Reported</option>
              <option value="OBSERVED">Observed</option>
              <option value="VERIFIED">Verified</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
          <label>
            Source
            <select
              aria-label="Evidence source filter"
              onChange={(event) => setEvidenceSource(event.target.value)}
              value={evidenceSource}
            >
              <option value="ALL">All sources</option>
              {[...new Set(data.evidence.map((item) => item.source_kind))]
                .sort()
                .map((source) => (
                  <option key={source} value={source}>
                    {source.replaceAll("_", " ")}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {filteredEvidence.length ? (
          <EvidenceList items={filteredEvidence} projectId={projectId} />
        ) : (
          <EmptyPanel
            title={
              data.evidence.length
                ? "No matching evidence"
                : "No evidence recorded yet"
            }
            description="Add a reference or explicitly select a saved Forge record. Forge will not download or inspect external URLs."
            action={
              data.evidence.length || archived ? undefined : "Register evidence"
            }
            to={`${base}/evidence/new`}
          />
        )}
      </>
    );
  } else if (isVerification) {
    content = (
      <>
        <div className="section-heading">
          <h2>Deterministic check library</h2>
          <Link className="button primary" to={`${base}/verifications/new`}>
            + New evaluation
          </Link>
        </div>
        <div className="fnd06-rule-grid">
          {data.rules.map((rule) => (
            <article className="fnd06-rule-card" key={rule.rule_id}>
              <div>
                <span className="mono-label">
                  {rule.rule_id} · v{rule.version}
                </span>
                <h3>{rule.title}</h3>
              </div>
              <span
                className={`status-chip ${rule.available ? "active" : "blocked"}`}
              >
                {rule.available ? "AVAILABLE" : "BLOCKED"}
              </span>
              <p>{rule.limitation}</p>
            </article>
          ))}
        </div>
        {tail === "verifications/new" ? (
          <VerificationForm
            data={data}
            archived={archived}
            pending={pending}
            error={formError}
            success={message}
            onPreview={(payload) =>
              forgeApi.previewVerification(workspace.id, projectId, payload)
            }
            onEvaluate={(payload) =>
              runMutation(
                () =>
                  forgeApi.evaluateVerification(
                    workspace.id,
                    projectId,
                    payload,
                  ),
                "Evaluation saved as an immutable snapshot.",
              )
            }
          />
        ) : (
          <>
            <section className="form-panel">
              <div className="section-heading">
                <h2>Verification activity</h2>
                <span>{data.verifications.length} snapshots</span>
              </div>
              {data.verifications.length ? (
                <div className="fnd06-list">
                  {data.verifications.map((item) => (
                    <article className="fnd06-row" key={item.id}>
                      <div>
                        <span className="mono-label">
                          {item.rule_id} · {item.rule_version} ·{" "}
                          {item.input_fingerprint.slice(0, 12)}
                        </span>
                        <h3>
                          {data.features.find(
                            (feature) => feature.id === item.feature_id,
                          )?.readable_id ?? "Project scope"}{" "}
                          · {item.findings[0]}
                        </h3>
                        <p>
                          {item.evaluated_at
                            ? formatDate(item.evaluated_at)
                            : "Preview only"}{" "}
                          ·{" "}
                          {item.stale
                            ? "STALE"
                            : "Historical snapshot preserved"}
                        </p>
                      </div>
                      <span
                        className={`status-chip ${item.stale ? "warning" : item.result.toLowerCase()}`}
                      >
                        {item.stale ? "STALE" : item.result}
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyPanel
                  title="No checks evaluated"
                  description="Choose a supported deterministic rule to inspect saved Forge records. A report is not a verification."
                  action="Configure a check"
                  to={`${base}/verifications/new`}
                />
              )}
            </section>
          </>
        )}
      </>
    );
  } else {
    const selectedCandidate = candidateId
      ? data.candidates.find((item) => item.id === candidateId)
      : null;
    content =
      candidateId && selectedCandidate ? (
        <CandidateDetail
          key={`${selectedCandidate.id}-${selectedCandidate.revision}`}
          candidate={selectedCandidate}
          data={data}
          dataRefresh={refresh}
          archived={archived}
          pending={pending}
          error={formError}
          success={message}
          gateWorkspaceId={workspace.id}
          onUpdate={(payload) =>
            void runMutation(
              () =>
                forgeApi.updateReleaseCandidate(
                  workspace.id,
                  projectId,
                  selectedCandidate.id,
                  { ...payload, expected_revision: selectedCandidate.revision },
                ),
              "Candidate draft updated.",
            )
          }
          onFreeze={() =>
            void runMutation(
              () =>
                forgeApi.freezeReleaseCandidate(
                  workspace.id,
                  projectId,
                  selectedCandidate.id,
                  selectedCandidate.revision,
                ),
              "Candidate frozen as an immutable snapshot.",
            )
          }
          onEvaluate={() =>
            void runMutation(
              () =>
                forgeApi.evaluateReleaseGates(
                  workspace.id,
                  projectId,
                  selectedCandidate.id,
                ),
              "Gate evaluation saved as an immutable snapshot.",
            )
          }
          onSaveManifest={(gateId) =>
            void runMutation(
              () =>
                forgeApi.saveReleaseManifest(
                  workspace.id,
                  projectId,
                  selectedCandidate.id,
                  gateId,
                ),
              "Manifest snapshot saved.",
            )
          }
        />
      ) : tail.endsWith("new") ? (
        <CandidateForm
          data={data}
          archived={archived}
          pending={pending}
          error={formError}
          success={message}
          onSubmit={(payload) =>
            runMutation(async () => {
              const item = await forgeApi.createReleaseCandidate(
                workspace.id,
                projectId,
                payload,
              );
              navigate(`${base}/release-candidates/${item.id}`);
            }, "Candidate draft saved.")
          }
        />
      ) : (
        <>
          <div className="section-heading">
            <h2>Release candidate archive</h2>
            <Link
              className="button primary"
              to={`${base}/release-candidates/new`}
            >
              + New candidate
            </Link>
          </div>
          {data.candidates.length ? (
            <div className="fnd06-list">
              {data.candidates.map((item) => (
                <Link
                  className="fnd06-row fnd06-link-row"
                  key={item.id}
                  to={`${base}/release-candidates/${item.id}`}
                >
                  <div>
                    <span className="mono-label">
                      {item.candidate_key} · revision {item.revision}
                    </span>
                    <h3>{item.title}</h3>
                    <p>
                      {item.intended_version || "Version not specified"} ·{" "}
                      {item.status} · {item.content_fingerprint.slice(0, 12)}
                    </p>
                  </div>
                  <span className={`status-chip ${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No release candidates"
              description="Create a candidate to pin Features, Context Packages, evidence and verification snapshots."
              action={archived ? undefined : "Create candidate"}
              to={`${base}/release-candidates/new`}
            />
          )}
        </>
      );
  }
  return (
    <PageFrame
      title={title}
      subtitle={`${data.project.name} · ${subtitle}`}
      onOpenPalette={onOpenPalette}
    >
      {nav}
      {archived && (
        <div className="feedback-panel fnd06-archived" role="status">
          This Project is archived. Delivery records remain readable; persistent
          mutations are disabled.
        </div>
      )}
      {formError && !isEvidence && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      {message && (
        <p className="feedback-panel fnd06-success" role="status">
          {message}
        </p>
      )}
      {content}
    </PageFrame>
  );
}
