import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { forgeApi } from "../../../api";
import type {
  ContextPackage,
  EvidenceRecord,
  Feature,
  GateEvaluation,
  ReleaseCandidateInput,
  HandoffRevision,
  ReleaseCandidate,
  ReleaseManifest,
  VerificationEvaluation,
} from "../../../api";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { DownloadLink } from "../../../shared/ui/DownloadLink";
import { formatDate } from "../../../shared/utils/formatDate";
import { type Loaded } from "../types";
import { ScopeCount } from "./ScopeCount";
import { MultiSelect } from "../components/MultiSelect";
import { ChecksTable } from "../verification/ChecksTable";

export function CandidateDetail({
  candidate,
  data,
  dataRefresh,
  archived,
  pending,
  error,
  success,
  gateWorkspaceId,
  onUpdate,
  onFreeze,
  onEvaluate,
  onSaveManifest,
}: {
  candidate: ReleaseCandidate;
  data: Loaded;
  dataRefresh: number;
  archived: boolean;
  pending: boolean;
  error: string;
  success: string;
  gateWorkspaceId: string;
  onUpdate: (payload: ReleaseCandidateInput) => void;
  onFreeze: () => void;
  onEvaluate: () => void;
  onSaveManifest: (gateId: string) => void;
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
  const [packageIds, setPackageIds] = useState(
    candidate.selection.context_package_ids,
  );
  const [evidenceIds, setEvidenceIds] = useState(
    candidate.selection.evidence_ids,
  );
  const [verificationIds, setVerificationIds] = useState(
    candidate.selection.verification_ids,
  );
  const [handoffIds, setHandoffIds] = useState(
    candidate.selection.handoff_revision_ids,
  );
  useEffect(() => {
    if (candidate.status !== "FROZEN") return;
    const controller = new AbortController();
    void Promise.all([
      forgeApi.previewReleaseGates(
        gateWorkspaceId,
        projectId,
        candidate.id,
        controller.signal,
      ),
      forgeApi.listReleaseGateHistory(
        gateWorkspaceId,
        projectId,
        candidate.id,
        controller.signal,
      ),
      forgeApi
        .getReleaseManifest(
          gateWorkspaceId,
          projectId,
          candidate.id,
          controller.signal,
        )
        .catch(() => null),
    ])
      .then(([current, rows, saved]) => {
        if (!controller.signal.aborted) {
          setGate(current);
          setHistory(rows);
          setManifest(saved);
          setLoadError("");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "Could not load candidate history.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    candidate.id,
    candidate.status,
    candidate.revision,
    gateWorkspaceId,
    projectId,
    candidate.content_fingerprint,
    dataRefresh,
  ]);
  const selections = candidate.selection;
  const candidateInput: ReleaseCandidateInput = {
    title,
    intended_version: version || undefined,
    description,
    feature_ids: featureIds,
    context_package_ids: packageIds,
    evidence_ids: evidenceIds,
    verification_ids: verificationIds,
    handoff_revision_ids: handoffIds,
  };
  const draftDirty =
    title !== candidate.title ||
    version !== (candidate.intended_version ?? "") ||
    description !== candidate.description ||
    JSON.stringify(candidateInput.feature_ids) !==
      JSON.stringify(selections.feature_ids) ||
    JSON.stringify(candidateInput.context_package_ids) !==
      JSON.stringify(selections.context_package_ids) ||
    JSON.stringify(candidateInput.evidence_ids) !==
      JSON.stringify(selections.evidence_ids) ||
    JSON.stringify(candidateInput.verification_ids) !==
      JSON.stringify(selections.verification_ids) ||
    JSON.stringify(candidateInput.handoff_revision_ids) !==
      JSON.stringify(selections.handoff_revision_ids);
  const gateLoading = candidate.status === "FROZEN" && loading && !gate;
  const currentSavedGate =
    gate &&
    history.find(
      (item) =>
        item.id &&
        !item.stale &&
        item.input_fingerprint === gate.input_fingerprint,
    );
  const downloadUrl = (format: "json" | "markdown") =>
    `/api/workspaces/${gateWorkspaceId}/projects/${projectId}/release-candidates/${candidate.id}/manifest/download?format=${format}${manifest ? `&manifest_id=${manifest.id}` : ""}`;
  return (
    <>
      <section className="form-panel">
        <div className="project-overview-header">
          <div>
            <span className="eyebrow">
              {candidate.candidate_key} · REVISION {candidate.revision}
            </span>
            <h2>{candidate.title}</h2>
            <p>
              {candidate.intended_version ?? "Intended version not set"} ·{" "}
              {candidate.status}
            </p>
          </div>
          <span className={`status-chip ${candidate.status.toLowerCase()}`}>
            {candidate.status}
          </span>
        </div>
        <p className="mono-label">
          Fingerprint · {candidate.content_fingerprint}
        </p>
        <div className="fnd06-scope-grid">
          <ScopeCount
            title="Features"
            ids={selections.feature_ids}
            labels={data.features.map((item) => ({
              id: item.id,
              label: `${item.readable_id} · ${item.title}`,
            }))}
          />
          <ScopeCount
            title="Context Packages"
            ids={selections.context_package_ids}
            labels={data.packages.map((item) => ({
              id: item.id ?? "",
              label: item.fingerprint.slice(0, 16),
            }))}
          />
          <ScopeCount
            title="Evidence"
            ids={selections.evidence_ids}
            labels={data.evidence.map((item) => ({
              id: item.id,
              label: item.title,
            }))}
          />
          <ScopeCount
            title="Verifications"
            ids={selections.verification_ids}
            labels={data.verifications.map((item) => ({
              id: item.id ?? "",
              label: `${item.rule_id} · ${item.result}`,
            }))}
          />
        </div>
        {candidate.snapshot && (
          <details className="fnd06-snapshot">
            <summary>Inspect frozen snapshot</summary>
            <pre>{JSON.stringify(candidate.snapshot, null, 2)}</pre>
          </details>
        )}
        {candidate.status === "DRAFT" ? (
          <>
            <section
              aria-label="Edit release candidate draft"
              className="form-panel fnd06-form"
            >
              <h3>Edit candidate draft</h3>
              <label>
                Candidate title
                <input
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  value={title}
                />
              </label>
              <label>
                Intended version
                <input
                  maxLength={80}
                  onChange={(event) => setVersion(event.target.value)}
                  value={version}
                />
              </label>
              <label>
                Description
                <textarea
                  maxLength={10000}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  value={description}
                />
              </label>
              <MultiSelect
                label="Included Features"
                items={data.features}
                selected={featureIds}
                onChange={(next) => {
                  setFeatureIds(next);
                  setPackageIds((current) =>
                    current.filter((id) =>
                      data.packages.some(
                        (item) =>
                          item.id === id && next.includes(item.feature_id),
                      ),
                    ),
                  );
                  setEvidenceIds((current) =>
                    current.filter((id) =>
                      data.evidence.some(
                        (item) =>
                          item.id === id &&
                          (!item.feature_id || next.includes(item.feature_id)),
                      ),
                    ),
                  );
                  setVerificationIds((current) =>
                    current.filter((id) =>
                      data.verifications.some(
                        (item) =>
                          item.id === id &&
                          (!item.feature_id || next.includes(item.feature_id)),
                      ),
                    ),
                  );
                  setHandoffIds((current) =>
                    current.filter((id) =>
                      data.handoffs.some(
                        (handoff) =>
                          data.handoffRevisions.some(
                            (revision) =>
                              revision.id === id &&
                              revision.handoff_id === handoff.id,
                          ) && next.includes(handoff.feature_id),
                      ),
                    ),
                  );
                }}
                getLabel={(item) =>
                  `${(item as Feature).readable_id} · ${(item as Feature).title}`
                }
              />
              <MultiSelect
                label="Pinned Context Packages"
                items={data.packages.filter(
                  (item): item is ContextPackage & { id: string } =>
                    featureIds.includes(item.feature_id) && Boolean(item.id),
                )}
                selected={packageIds}
                onChange={setPackageIds}
                getLabel={(item) =>
                  `${(item as ContextPackage).fingerprint.slice(0, 16)} · ${(item as ContextPackage).schema_version}`
                }
              />
              <MultiSelect
                label="Selected Evidence"
                items={data.evidence.filter(
                  (item) =>
                    !item.feature_id || featureIds.includes(item.feature_id),
                )}
                selected={evidenceIds}
                onChange={setEvidenceIds}
                getLabel={(item) =>
                  `${(item as EvidenceRecord).title} · ${(item as EvidenceRecord).status}`
                }
              />
              <MultiSelect
                label="Verification snapshots"
                items={data.verifications.filter(
                  (item): item is VerificationEvaluation & { id: string } =>
                    Boolean(item.id) &&
                    (!item.feature_id || featureIds.includes(item.feature_id)),
                )}
                selected={verificationIds}
                onChange={setVerificationIds}
                getLabel={(item) =>
                  `${(item as VerificationEvaluation).rule_id} · ${(item as VerificationEvaluation).result}`
                }
              />
              <MultiSelect
                label="Published Handoff revisions"
                items={data.handoffRevisions.filter((item) =>
                  data.handoffs.some(
                    (handoff) =>
                      handoff.id === item.handoff_id &&
                      featureIds.includes(handoff.feature_id),
                  ),
                )}
                selected={handoffIds}
                onChange={setHandoffIds}
                getLabel={(item) =>
                  `Revision ${(item as HandoffRevision).revision} · ${(item as HandoffRevision).fingerprint.slice(0, 12)}`
                }
              />
              <button
                className="button secondary"
                disabled={
                  archived ||
                  pending ||
                  !draftDirty ||
                  !title.trim() ||
                  featureIds.length === 0
                }
                onClick={() => onUpdate(candidateInput)}
                type="button"
              >
                {pending ? "Saving draft…" : "Save draft changes"}
              </button>
            </section>
            <button
              className="button primary"
              disabled={archived || pending || draftDirty}
              onClick={onFreeze}
              type="button"
            >
              Freeze candidate snapshot
            </button>
          </>
        ) : (
          <button
            className="button primary"
            disabled={archived || pending}
            onClick={onEvaluate}
            type="button"
          >
            {pending ? "Evaluating…" : "Evaluate release gates"}
          </button>
        )}
        <p className="fnd06-trust-note">
          A candidate is not a published release. Freeze preserves a snapshot;
          subsequent changes require a new candidate.
        </p>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="feedback-panel fnd06-success" role="status">
          {success}
        </p>
      )}
      {candidate.status === "FROZEN" &&
        (gateLoading ? (
          <LoadingPanel label="Loading gate preview" />
        ) : loadError ? (
          <p className="form-error" role="alert">
            {loadError}
          </p>
        ) : (
          gate && (
            <>
              <section className="form-panel">
                <div className="section-heading">
                  <h2>Release gate evaluation</h2>
                  <span className={`status-chip ${gate.result.toLowerCase()}`}>
                    {gate.stale ? "STALE" : gate.result}
                  </span>
                </div>
                <p className="muted-copy">
                  Gate result is limited to ruleset {gate.ruleset_version}. It
                  does not establish functional completeness or publication.
                </p>
                <ChecksTable gate={gate} />
                {currentSavedGate?.id && (
                  <button
                    className="button secondary"
                    disabled={pending || archived}
                    onClick={() => onSaveManifest(currentSavedGate.id!)}
                    type="button"
                  >
                    Generate &amp; save manifest
                  </button>
                )}
                {manifest && (
                  <div className="fnd06-downloads">
                    <strong>Saved {manifest.schema_version}</strong>
                    <span>{manifest.fingerprint}</span>
                    <DownloadLink className="button secondary" href={downloadUrl("json")}>
                      Download JSON
                    </DownloadLink>
                    <DownloadLink
                      className="button secondary"
                      href={downloadUrl("markdown")}
                    >
                      Download Markdown
                    </DownloadLink>
                    <span className="status-chip neutral">NOT PUBLISHED</span>
                  </div>
                )}
              </section>
              <section className="form-panel">
                <div className="section-heading">
                  <h2>Immutable gate history</h2>
                  <span>{history.length} evaluations</span>
                </div>
                {history.length ? (
                  history.map((item) => (
                    <div className="fnd06-history-row" key={item.id}>
                      <span>
                        {item.evaluated_at
                          ? formatDate(item.evaluated_at)
                          : "Saved evaluation"}
                      </span>
                      <span className="mono-label">
                        {item.ruleset_version} ·{" "}
                        {item.input_fingerprint.slice(0, 16)}
                      </span>
                      <span
                        className={`status-chip ${(item.stale ? "warning" : (item.stored_result ?? item.result)).toLowerCase()}`}
                      >
                        {item.stale
                          ? "STALE"
                          : (item.stored_result ?? item.result)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="muted-copy">
                    No saved gate evaluation yet. Preview updates as selected
                    inputs change.
                  </p>
                )}
              </section>
            </>
          )
        ))}
    </>
  );
}
