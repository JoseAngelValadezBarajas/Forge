import { useState } from "react";
import type { FormEvent } from "react";

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
    <label>Name<input aria-label="Project name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></label>
    <label>Description<span className="field-hint">Optional</span><textarea aria-label="Project description" maxLength={2000} onChange={(event) => setDescription(event.target.value)} rows={4} value={description} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions">{onCancel && <button className="button secondary" onClick={onCancel} type="button">Cancel</button>}<button className="button primary" disabled={saving} type="submit">{saving ? "Saving…" : submitLabel}</button></div>
  </form>;
}
