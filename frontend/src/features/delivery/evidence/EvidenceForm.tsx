import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { type Loaded } from "../types";

export function EvidenceForm({
  data,
  archived,
  pending,
  error,
  success,
  onSubmit,
}: {
  data: Loaded;
  archived: boolean;
  pending: boolean;
  error: string;
  success: string;
  onSubmit: (payload: {
    feature_id?: string;
    acceptance_criterion_id?: string;
    evidence_type: string;
    title: string;
    description: string;
    source_kind: string;
    source_reference?: string;
    declared_outcome?: string;
  }) => void;
}) {
  const [featureId, setFeatureId] = useState("");
  const [criterionId, setCriterionId] = useState("");
  const [type, setType] = useState("document_reference");
  const [kind, setKind] = useState("safe_link");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [outcome, setOutcome] = useState("");
  const criteria = data.criteria.filter(
    (item) => item.feature_id === featureId,
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      feature_id: featureId || undefined,
      acceptance_criterion_id: criterionId || undefined,
      evidence_type: type,
      title,
      description,
      source_kind: kind,
      source_reference: kind === "manual" ? undefined : reference,
      declared_outcome: outcome || undefined,
    });
  };
  return (
    <form className="form-panel fnd06-form" onSubmit={submit}>
      <div className="section-heading">
        <h2>Describe the evidence</h2>
        <span>Unverified unless evaluated</span>
      </div>
      <label>
        Feature (optional)
        <select
          onChange={(event) => {
            setFeatureId(event.target.value);
            setCriterionId("");
          }}
          value={featureId}
        >
          <option value="">Project level</option>
          {data.features.map((item) => (
            <option key={item.id} value={item.id}>
              {item.readable_id} · {item.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Acceptance criterion (optional)
        <select
          disabled={!featureId}
          onChange={(event) => setCriterionId(event.target.value)}
          value={criterionId}
        >
          <option value="">Not linked</option>
          {criteria.map((item) => (
            <option key={item.id} value={item.id}>
              {item.description}
            </option>
          ))}
        </select>
      </label>
      <label>
        Evidence type
        <select onChange={(event) => setType(event.target.value)} value={type}>
          {[
            "reported_test_result",
            "document_reference",
            "artifact_reference",
            "git_observation_reference",
            "context_snapshot_reference",
            "handoff_revision_reference",
            "manual_attestation",
          ].map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
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
      <label>
        Source kind
        <select
          onChange={(event) => {
            setKind(event.target.value);
            setReference("");
          }}
          value={kind}
        >
          {[
            "safe_link",
            "artifact",
            "commit",
            "context_package",
            "git_observation",
            "handoff_revision",
            "manual",
          ].map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      {kind === "context_package" ? (
        <label>
          Saved Context Package
          <select
            onChange={(event) => setReference(event.target.value)}
            required
            value={reference}
          >
            <option value="">Choose a saved package</option>
            {data.packages
              .filter((item) => !featureId || item.feature_id === featureId)
              .map((item) => (
                <option key={item.id} value={item.id ?? ""}>
                  {
                    data.features.find(
                      (feature) => feature.id === item.feature_id,
                    )?.readable_id
                  }{" "}
                  · {item.fingerprint.slice(0, 12)}
                </option>
              ))}
          </select>
        </label>
      ) : kind === "git_observation" ? (
        <label>
          Saved Git observation
          <select
            onChange={(event) => setReference(event.target.value)}
            required
            value={reference}
          >
            <option value="">Choose an observation</option>
            {data.observations.map(({ repository, observation }) => (
              <option key={observation.id} value={observation.id}>
                {repository.root_path.split(/[\\/]/).at(-1)} ·{" "}
                {observation.head_sha?.slice(0, 12) ?? observation.status}
              </option>
            ))}
          </select>
          <span className="field-hint">
            The saved observation remains OBSERVED; no repository is read here.
          </span>
        </label>
      ) : kind === "handoff_revision" ? (
        <label>
          Saved Handoff revision
          <select
            onChange={(event) => setReference(event.target.value)}
            required
            value={reference}
          >
            <option value="">Choose a revision</option>
            {data.handoffRevisions
              .filter(
                (item) => !featureId || item.payload.feature_id === featureId,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  Revision {item.revision} · {item.fingerprint.slice(0, 12)}
                </option>
              ))}
          </select>
        </label>
      ) : (
        kind !== "manual" && (
          <label>
            Source reference
            <input
              maxLength={1000}
              onChange={(event) => setReference(event.target.value)}
              placeholder={
                kind === "safe_link"
                  ? "https://…"
                  : kind === "commit"
                    ? "Hexadecimal commit ID"
                    : "Opaque artifact identifier"
              }
              required
              value={reference}
            />
          </label>
        )
      )}
      <label>
        Declared outcome (optional)
        <input
          maxLength={5000}
          onChange={(event) => setOutcome(event.target.value)}
          value={outcome}
        />
      </label>
      <div className="fnd06-trust-callout">
        <strong>PROVENANCE: ASSIGNED BY SOURCE</strong>
        <p>
          External references and manual attestations remain REPORTED. Saved
          Forge observations remain OBSERVED.
        </p>
        <span>Forge will not fetch a URL or open an arbitrary path.</span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      <div className="form-actions">
        <Link
          className="button secondary"
          to={`/projects/${data.project.id}/delivery/evidence`}
        >
          Cancel
        </Link>
        <button
          className="button primary"
          disabled={archived || pending}
          type="submit"
        >
          {pending ? "Saving…" : "Register evidence"}
        </button>
      </div>
    </form>
  );
}
