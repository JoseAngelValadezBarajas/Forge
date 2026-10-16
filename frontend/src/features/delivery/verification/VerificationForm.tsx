import { useState } from "react";
import type { EvidenceRecord, VerificationEvaluation } from "../../../api";
import type { VerificationRequestPayload, VerificationRuleId } from "../api/contracts";
import { type Loaded } from "../types";
import { MultiSelect } from "../components/MultiSelect";

export function VerificationForm({
  data,
  archived,
  pending,
  error,
  success,
  onPreview,
  onEvaluate,
}: {
  data: Loaded;
  archived: boolean;
  pending: boolean;
  error: string;
  success: string;
  onPreview: (payload: VerificationRequestPayload) => Promise<VerificationEvaluation>;
  onEvaluate: (payload: VerificationRequestPayload) => void;
}) {
  const [ruleId, setRuleId] = useState<VerificationRuleId>("V02");
  const [featureId, setFeatureId] = useState("");
  const [contextId, setContextId] = useState("");
  const [handoffId, setHandoffId] = useState("");
  const [expectedDigest, setExpectedDigest] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<VerificationEvaluation | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewPending, setPreviewPending] = useState(false);
  const rule = data.rules.find((item) => item.rule_id === ruleId);
  const payload = {
    rule_id: ruleId,
    feature_id: featureId || undefined,
    context_package_id: contextId || undefined,
    expected_digest: expectedDigest || undefined,
    handoff_revision_id: handoffId || undefined,
    evidence_ids: evidenceIds,
  };
  return (
    <section className="form-panel fnd06-form">
      <div className="section-heading">
        <h2>Configure verification check</h2>
        <span>Fail closed</span>
      </div>
      <label>
        Rule
        <select
          onChange={(event) => {
            setRuleId(event.target.value as VerificationRuleId);
            setContextId("");
            setHandoffId("");
            setEvidenceIds([]);
          }}
          value={ruleId}
        >
          {data.rules.map((item) => (
            <option key={item.rule_id} value={item.rule_id}>
              {item.rule_id} · {item.title}
              {item.available ? "" : " (blocked)"}
            </option>
          ))}
        </select>
      </label>
      {(ruleId === "V02" || ruleId === "V04") && (
        <label>
          Feature
          <select
            onChange={(event) => setFeatureId(event.target.value)}
            value={featureId}
          >
            <option value="">Choose a Feature</option>
            {data.features.map((item) => (
              <option key={item.id} value={item.id}>
                {item.readable_id} · {item.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {ruleId === "V02" && (
        <label>
          Saved Context Package
          <select
            onChange={(event) => setContextId(event.target.value)}
            value={contextId}
          >
            <option value="">Choose a saved package</option>
            {data.packages
              .filter((item) => !featureId || item.feature_id === featureId)
              .map((item) => (
                <option key={item.id} value={item.id ?? ""}>
                  {item.fingerprint.slice(0, 16)} · {item.schema_version}
                </option>
              ))}
          </select>
        </label>
      )}
      {ruleId === "V02" && (
        <label>
          Expected SHA-256
          <input
            maxLength={64}
            onChange={(event) => setExpectedDigest(event.target.value)}
            placeholder="Defaults to saved fingerprint"
            value={expectedDigest}
          />
        </label>
      )}
      {ruleId === "V03" && (
        <label>
          Saved Handoff revision
          <select
            onChange={(event) => setHandoffId(event.target.value)}
            value={handoffId}
          >
            <option value="">Choose a revision</option>
            {data.handoffRevisions.map((item) => (
              <option key={item.id} value={item.id}>
                r{item.revision} · {item.fingerprint.slice(0, 16)}
              </option>
            ))}
          </select>
        </label>
      )}
      {ruleId === "V04" && (
        <MultiSelect
          items={data.evidence.filter(
            (item) =>
              item.status === "ACTIVE" &&
              (!featureId ||
                item.feature_id === featureId ||
                item.feature_id === null),
          )}
          selected={evidenceIds}
          onChange={setEvidenceIds}
          label="Evidence Records"
          getLabel={(item) =>
            `${(item as EvidenceRecord).title} · ${(item as EvidenceRecord).provenance}`
          }
        />
      )}
      <div className="fnd06-trust-callout">
        <strong>{rule?.available ? "SCOPED PROOF" : "RULE UNSUPPORTED"}</strong>
        <p>{rule?.limitation}</p>
        <span>
          Inputs are persisted snapshots; no shell or network access occurs.
        </span>
      </div>
      {previewError && (
        <p className="form-error" role="alert">
          {previewError}
        </p>
      )}
      {preview && (
        <div className="fnd06-preview" role="status">
          <span className={`status-chip ${preview.result.toLowerCase()}`}>
            {preview.result}
          </span>
          <p>{preview.findings.join(" ")}</p>
          <span className="mono-label">
            Input fingerprint · {preview.input_fingerprint}
          </span>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      <div className="form-actions">
        <button
          className="button secondary"
          disabled={pending || previewPending}
          onClick={() => {
            setPreviewError("");
            setPreviewPending(true);
            void onPreview(payload)
              .then(setPreview)
              .catch((cause: unknown) =>
                setPreviewError(
                  cause instanceof Error ? cause.message : "Preview failed.",
                ),
              )
              .finally(() => setPreviewPending(false));
          }}
          type="button"
        >
          {previewPending ? "Previewing…" : "Preview"}
        </button>
        <button
          className="button primary"
          disabled={archived || pending || previewPending || !rule?.available}
          onClick={() => onEvaluate(payload)}
          type="button"
        >
          {pending ? "Evaluating…" : "Evaluate & Save"}
        </button>
      </div>
    </section>
  );
}
