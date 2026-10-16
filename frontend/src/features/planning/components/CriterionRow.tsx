import { useState } from "react";
import type { FormEvent } from "react";
import { type AcceptanceCriterion } from "../../../api";

export function CriterionRow({
  criterion,
  onSave,
  onMove,
  first,
  last,
  disabled,
}: {
  criterion: AcceptanceCriterion;
  onSave: (payload: {
    description: string;
    satisfied: boolean;
  }) => Promise<boolean>;
  onMove: (direction: "up" | "down") => Promise<boolean>;
  first: boolean;
  last: boolean;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(criterion.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!description.trim()) {
      setError("Acceptance criterion is required.");
      return;
    }
    setSaving(true);
    const saved = await onSave({ description, satisfied: criterion.satisfied });
    setSaving(false);
    if (saved) {
      setEditing(false);
      setError(null);
    } else setError("Could not save acceptance criterion. Try again.");
  };
  const toggle = async () => {
    setSaving(true);
    await onSave({
      description: criterion.description,
      satisfied: !criterion.satisfied,
    });
    setSaving(false);
  };
  const move = async (direction: "up" | "down") => {
    setSaving(true);
    await onMove(direction);
    setSaving(false);
  };
  return (
    <li className="planning-item criterion-item">
      {editing ? (
        <form className="item-edit-form" onSubmit={(event) => void save(event)}>
          <label>
            Description
            <input
              aria-label={`Criterion description for ${criterion.description}`}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
          <button
            className="button secondary"
            disabled={saving || disabled}
            type="submit"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            className="button ghost"
            disabled={saving || disabled}
            onClick={() => setEditing(false)}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button
            aria-label={`${criterion.satisfied ? "Mark unsatisfied" : "Mark satisfied"}: ${criterion.description}`}
            className={`criterion-check${criterion.satisfied ? " checked" : ""}`}
            disabled={saving || disabled}
            onClick={() => void toggle()}
            type="button"
          >
            {criterion.satisfied ? "✓" : ""}
          </button>
          <span className="planning-item-copy">
            <strong className={criterion.satisfied ? "task-done" : ""}>
              {criterion.description}
            </strong>
            <small>Manual declaration only; not verification evidence.</small>
          </span>
          <button
            aria-label={`Edit criterion ${criterion.description}`}
            className="button ghost"
            disabled={disabled}
            onClick={() => setEditing(true)}
            type="button"
          >
            Edit
          </button>
        </>
      )}
      <div className="reorder-controls">
        <button
          aria-label={`Move criterion ${criterion.description} up`}
          className="icon-button"
          disabled={first || saving || disabled}
          onClick={() => void move("up")}
          type="button"
        >
          ↑
        </button>
        <button
          aria-label={`Move criterion ${criterion.description} down`}
          className="icon-button"
          disabled={last || saving || disabled}
          onClick={() => void move("down")}
          type="button"
        >
          ↓
        </button>
      </div>
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </li>
  );
}
