import { useState } from "react";
import type { FormEvent } from "react";
import {
  type Epic,
  type FeaturePriority,
  type FeatureStatus,
} from "../../../api";
import { label, priorities, statuses } from "../utils";

export type FeatureFormPayload = {
  title: string;
  description: string;
  goal: string;
  priority: FeaturePriority;
  status: FeatureStatus;
  epic_id?: string;
  clear_epic?: boolean;
};

export function FeatureCreateForm({
  epics,
  onSubmit,
  onCancel,
  actionPending,
}: {
  epics: Epic[];
  onSubmit: (
    payload: Omit<FeatureFormPayload, "clear_epic">,
  ) => Promise<boolean>;
  onCancel: () => void;
  actionPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [priority, setPriority] = useState<FeaturePriority>("medium");
  const [status, setStatus] = useState<FeatureStatus>("backlog");
  const [epicId, setEpicId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Feature title is required.");
      return;
    }
    setError(null);
    await onSubmit({
      title,
      description,
      goal,
      priority,
      status,
      ...(epicId ? { epic_id: epicId } : {}),
    });
  };
  return (
    <form className="planning-form" onSubmit={(event) => void submit(event)}>
      <div className="section-heading">
        <h2>Create feature</h2>
        <button
          aria-label="Close create feature"
          className="icon-button"
          onClick={onCancel}
          type="button"
        >
          x
        </button>
      </div>
      <div className="form-grid">
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
          Priority
          <select
            onChange={(event) =>
              setPriority(event.target.value as FeaturePriority)
            }
            value={priority}
          >
            {priorities.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Initial state
          <select
            onChange={(event) => setStatus(event.target.value as FeatureStatus)}
            value={status}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Epic
          <select
            onChange={(event) => setEpicId(event.target.value)}
            value={epicId}
          >
            <option value="">Unassigned</option>
            {epics.map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.title}
              </option>
            ))}
          </select>
        </label>
        <label className="wide-field">
          Goal
          <textarea
            onChange={(event) => setGoal(event.target.value)}
            rows={2}
            value={goal}
          />
        </label>
        <label className="wide-field">
          Description
          <textarea
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            value={description}
          />
        </label>
      </div>
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
          {actionPending ? "Creating..." : "Create feature"}
        </button>
      </div>
    </form>
  );
}
