import { useState } from "react";
import type { FormEvent } from "react";
import { type Feature, type InvariantCreatePayload } from "../../../api";

const emptyInvariant: InvariantCreatePayload = {
  title: "",
  statement: "",
  rationale: "",
};

export function InvariantForm({
  initial = emptyInvariant,
  features,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  initial?: InvariantCreatePayload;
  features: Feature[];
  onCancel?: () => void;
  onSubmit: (payload: InvariantCreatePayload) => Promise<boolean>;
  submitLabel: string;
}) {
  const [form, setForm] = useState<InvariantCreatePayload>(initial);
  const [error, setError] = useState<string | null>(null);
  const change = (key: keyof InvariantCreatePayload, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      ![form.title, form.statement, form.rationale].every((value) =>
        value?.trim(),
      )
    ) {
      setError("Title, statement and rationale are required.");
      return;
    }
    setError(null);
    const saved = await onSubmit(form);
    if (!saved) setError("Could not save the invariant. Try again.");
  };
  return (
    <form
      className="planning-form fnd-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow accent">INVARIANT SCOPE</span>
          <h2>{submitLabel}</h2>
        </div>
        {onCancel && (
          <button
            aria-label="Close invariant form"
            className="icon-button"
            onClick={onCancel}
            type="button"
          >
            x
          </button>
        )}
      </div>
      <div className="form-grid">
        <label>
          Title
          <input
            autoFocus
            maxLength={160}
            onChange={(event) => change("title", event.target.value)}
            value={form.title}
          />
        </label>
        <label>
          Scope
          <select
            aria-label="Invariant scope"
            onChange={(event) => change("feature_id", event.target.value)}
            value={form.feature_id ?? ""}
          >
            <option value="">Project invariant</option>
            {features.map((feature) => (
              <option key={feature.id} value={feature.id}>
                {feature.key} · {feature.title}
              </option>
            ))}
          </select>
        </label>
        <label className="wide-field">
          Statement
          <textarea
            onChange={(event) => change("statement", event.target.value)}
            rows={3}
            value={form.statement}
          />
        </label>
        <label className="wide-field">
          Rationale
          <textarea
            onChange={(event) => change("rationale", event.target.value)}
            rows={3}
            value={form.rationale}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {onCancel && (
          <button className="button secondary" onClick={onCancel} type="button">
            Cancel
          </button>
        )}
        <button className="button primary" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
