import { useState } from "react";
import type { FormEvent } from "react";
import { type Epic, type EpicStatus } from "../../../api";
import { label, epicStatuses } from "../utils";

export function EpicEditForm({
  epic,
  onSubmit,
  onCancel,
  actionPending,
}: {
  epic: Epic;
  onSubmit: (payload: {
    title: string;
    description: string;
    status: EpicStatus;
  }) => Promise<boolean>;
  onCancel: () => void;
  actionPending: boolean;
}) {
  const [title, setTitle] = useState(epic.title);
  const [description, setDescription] = useState(epic.description ?? "");
  const [status, setStatus] = useState<EpicStatus>(epic.status);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Epic title is required.");
      return;
    }
    setError(null);
    const saved = await onSubmit({ title, description, status });
    if (!saved) setError("Could not save epic. Try again.");
  };
  return (
    <form
      className="planning-form compact-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="section-heading">
        <h2>Edit epic</h2>
        <button
          aria-label="Close edit epic"
          className="icon-button"
          onClick={onCancel}
          type="button"
        >
          x
        </button>
      </div>
      <label>
        Title
        <input
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
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
      <label>
        Status
        <select
          onChange={(event) => setStatus(event.target.value as EpicStatus)}
          value={status}
        >
          {epicStatuses.map((item) => (
            <option key={item} value={item}>
              {label(item)}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button secondary" onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className="button primary"
          disabled={actionPending}
          type="submit"
        >
          {actionPending ? "Saving..." : "Save epic"}
        </button>
      </div>
    </form>
  );
}
