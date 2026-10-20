import { useState } from "react";
import type { FormEvent } from "react";
import { type DecisionCreatePayload } from "../../../api";
import { Button } from "../../../shared/ui/Button";
import { FormField } from "../../../shared/ui/FormField";
import { IconButton } from "../../../shared/ui/IconButton";
import { Textarea } from "../../../shared/ui/Textarea";
import { TextInput } from "../../../shared/ui/TextInput";

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
          <IconButton
            aria-label="Close decision form"
            onClick={onCancel}
          >
            x
          </IconButton>
        )}
      </div>
      <div className="form-grid">
        <FormField label="Title">
          <TextInput
            autoFocus
            maxLength={160}
            onChange={(event) => change("title", event.target.value)}
            value={form.title}
          />
        </FormField>
        <FormField label="Context">
          <Textarea
            aria-label="Decision context"
            onChange={(event) => change("context", event.target.value)}
            rows={3}
            value={form.context}
          />
        </FormField>
        <FormField label="Decision">
          <Textarea
            aria-label="Decision"
            onChange={(event) => change("decision", event.target.value)}
            rows={3}
            value={form.decision}
          />
        </FormField>
        <FormField label="Rationale">
          <Textarea
            aria-label="Decision rationale"
            onChange={(event) => change("rationale", event.target.value)}
            rows={3}
            value={form.rationale}
          />
        </FormField>
        <FormField label="Alternatives considered">
          <Textarea
            onChange={(event) =>
              change("alternatives_considered", event.target.value)
            }
            rows={2}
            value={form.alternatives_considered ?? ""}
          />
        </FormField>
        <FormField label="Tradeoffs">
          <Textarea
            onChange={(event) => change("tradeoffs", event.target.value)}
            rows={2}
            value={form.tradeoffs ?? ""}
          />
        </FormField>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {onCancel && (
          <Button onClick={onCancel} variant="secondary">
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
