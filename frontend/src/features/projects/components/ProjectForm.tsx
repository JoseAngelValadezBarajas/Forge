import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../../shared/ui/Button";
import { FormField } from "../../../shared/ui/FormField";
import { Textarea } from "../../../shared/ui/Textarea";
import { TextInput } from "../../../shared/ui/TextInput";

export function ProjectForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; description: string };
  submitLabel: string;
  onSubmit: (name: string, description: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError("Project name is required."); return; }
    setSaving(true);
    try { await onSubmit(name, description); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save project."); }
    finally { setSaving(false); }
  };
  return <form className="project-form" onSubmit={submit}>
    <FormField label="Name"><TextInput aria-label="Project name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></FormField>
    <FormField hint="Optional" label="Description"><Textarea aria-label="Project description" maxLength={2000} onChange={(event) => setDescription(event.target.value)} rows={4} value={description} /></FormField>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions">{onCancel && <Button onClick={onCancel} variant="secondary">Cancel</Button>}<Button loading={saving} loadingLabel="Saving…" type="submit" variant="primary">{submitLabel}</Button></div>
  </form>;
}
