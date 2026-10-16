import { useState } from "react";
import { Link } from "react-router-dom";
import type {
  ContextPackage,
  EvidenceRecord,
  Feature,
  HandoffRevision,
  VerificationEvaluation,
} from "../../../api";
import { type Loaded } from "../types";
import { MultiSelect } from "../components/MultiSelect";

export function CandidateForm({
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
    title: string;
    intended_version?: string;
    description?: string;
    feature_ids: string[];
    context_package_ids: string[];
    evidence_ids: string[];
    verification_ids: string[];
    handoff_revision_ids: string[];
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [verificationIds, setVerificationIds] = useState<string[]>([]);
  const [handoffIds, setHandoffIds] = useState<string[]>([]);
  const selectedEvidence = data.evidence.filter(
    (item) => !item.feature_id || featureIds.includes(item.feature_id),
  );
  const selectedVerifications = data.verifications.filter(
    (item) => !item.feature_id || featureIds.includes(item.feature_id),
  );
  return (
    <section className="form-panel fnd06-form">
      <div className="section-heading">
        <h2>Create release candidate</h2>
        <span>No release actions</span>
      </div>
      <label>
        Candidate label
        <input
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />
      </label>
      <label>
        Intended version (optional)
        <input
          onChange={(event) => setVersion(event.target.value)}
          placeholder="For example, 0.1.0"
          value={version}
        />
      </label>
      <label>
        Description
        <textarea
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
          setPackageIds([]);
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
        items={selectedEvidence}
        selected={evidenceIds}
        onChange={setEvidenceIds}
        getLabel={(item) =>
          `${(item as EvidenceRecord).title} · ${(item as EvidenceRecord).status}`
        }
      />
      <MultiSelect
        label="Verification snapshots"
        items={selectedVerifications.filter(
          (item): item is VerificationEvaluation & { id: string } =>
            Boolean(item.id),
        )}
        selected={verificationIds}
        onChange={setVerificationIds}
        getLabel={(item) =>
          `${(item as VerificationEvaluation).rule_id} · ${(item as VerificationEvaluation).result} · ${(item as VerificationEvaluation).input_fingerprint.slice(0, 10)}`
        }
      />
      <MultiSelect
        label="Published Handoff revisions (optional)"
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
      <div className="fnd06-trust-callout">
        <strong>SNAPSHOT NOTICE</strong>
        <p>
          Selections are pinned by identifier and fingerprint. Every acceptance
          criterion requires linked active documentary evidence for the
          corresponding gate.
        </p>
        <span>
          Creating a candidate does not mark Features done, create Git tags or
          publish a release.
        </span>
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
          to={`/projects/${data.project.id}/delivery/release-candidates`}
        >
          Cancel
        </Link>
        <button
          className="button primary"
          disabled={archived || pending || !featureIds.length}
          onClick={() =>
            onSubmit({
              title,
              intended_version: version || undefined,
              description,
              feature_ids: featureIds,
              context_package_ids: packageIds,
              evidence_ids: evidenceIds,
              verification_ids: verificationIds,
              handoff_revision_ids: handoffIds,
            })
          }
          type="button"
        >
          {pending ? "Saving…" : "Create candidate"}
        </button>
      </div>
    </section>
  );
}
