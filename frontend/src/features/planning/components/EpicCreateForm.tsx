import { useState } from "react";
import type { FormEvent } from "react";

export function EpicCreateForm({
  onSubmit,
  onCancel,
  actionPending,
}: {
  onSubmit: (title: string, description: string) => Promise<boolean>;
  onCancel: () => void;
  actionPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Epic title is required.");
      return;
    }
    setError(null);
    await onSubmit(title, description);
  };
  return (
    <form
      className="planning-form compact-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="section-heading">
        <h2>Create epic</h2>
        <button
          aria-label="Close create epic"
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
          autoFocus
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
          {actionPending ? "Creating..." : "Create epic"}
        </button>
      </div>
    </form>
  );
}
