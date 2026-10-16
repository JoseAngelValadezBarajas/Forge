import { useState } from "react";
import type { FormEvent } from "react";
import { type DecisionCreatePayload } from "../../../api";

const emptyDecision: DecisionCreatePayload = {
  title: "",
  context: "",
  decision: "",
  rationale: "",
};

export function DecisionForm({
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
  const change = (key: keyof DecisionCreatePayload, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      ![form.title, form.context, form.decision, form.rationale].every(
        (value) => value?.trim(),
      )
    ) {
      setError("Title, context, decision and rationale are required.");
      return;
    }
    setError(null);
    const saved = await onSubmit(form);
    if (!saved) setError("Could not save the decision. Try again.");
  };
  return (
    <form
      className="planning-form fnd-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow accent">DECISION CONTEXT</span>
          <h2>{submitLabel}</h2>
        </div>
        {onCancel && (
          <button
            aria-label="Close decision form"
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
          Context
          <textarea
            aria-label="Decision context"
            onChange={(event) => change("context", event.target.value)}
            rows={3}
            value={form.context}
          />
        </label>
        <label>
          Decision
          <textarea
            aria-label="Decision"
            onChange={(event) => change("decision", event.target.value)}
            rows={3}
            value={form.decision}
          />
        </label>
        <label>
          Rationale
          <textarea
            aria-label="Decision rationale"
            onChange={(event) => change("rationale", event.target.value)}
            rows={3}
            value={form.rationale}
          />
        </label>
        <label>
          Alternatives considered
          <textarea
            onChange={(event) =>
              change("alternatives_considered", event.target.value)
            }
            rows={2}
            value={form.alternatives_considered ?? ""}
          />
        </label>
        <label>
          Tradeoffs
          <textarea
            onChange={(event) => change("tradeoffs", event.target.value)}
            rows={2}
            value={form.tradeoffs ?? ""}
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
