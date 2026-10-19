import { useState } from "react";
import type { FormEvent } from "react";
import { type Task, type TaskStatus } from "../../../api";

export function TaskRow({
  task,
  onSave,
  onMove,
  first,
  last,
  disabled,
  readOnly = false,
}: {
  task: Task;
  onSave: (payload: {
    title: string;
    description: string;
    status: TaskStatus;
  }) => Promise<boolean>;
  onMove: (direction: "up" | "down") => Promise<boolean>;
  first: boolean;
  last: boolean;
  disabled: boolean;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    setSaving(true);
    const saved = await onSave({ title, description, status });
    setSaving(false);
    if (saved) {
      setEditing(false);
      setError(null);
    } else setError("Could not save task. Try again.");
  };
  const updateStatus = async (nextStatus: TaskStatus) => {
    setSaving(true);
    const saved = await onSave({
      title: task.title,
      description: task.description ?? "",
      status: nextStatus,
    });
    setSaving(false);
    if (!saved) setError("Could not save task. Try again.");
  };
  const move = async (direction: "up" | "down") => {
    setSaving(true);
    await onMove(direction);
    setSaving(false);
  };
  return (
    <li className="planning-item">
      <span className={`task-state ${task.status}`} aria-hidden="true" />
      {editing ? (
        <form className="item-edit-form" onSubmit={(event) => void save(event)}>
          <label>
            Title
            <input
              aria-label={`Task title for ${task.title}`}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label>
            Description
            <input
              aria-label={`Task description for ${task.title}`}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
          <label>
            Status
            <select
              aria-label={`Task state for ${task.title}`}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
              value={status}
            >
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
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
          <span className="planning-item-copy">
            <strong className={task.status === "done" ? "task-done" : ""}>
              {task.title}
            </strong>
            {task.description && <small>{task.description}</small>}
          </span>
          {!readOnly && <select
            aria-label={`Status for ${task.title}`}
            disabled={disabled || saving}
            onChange={(event) => {
              setStatus(event.target.value as TaskStatus);
              void updateStatus(event.target.value as TaskStatus);
            }}
            value={task.status}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>}
          {readOnly && <small className="read-only-item-state">{task.status.replace("_", " ")}</small>}
          {!readOnly && <button
            aria-label={`Edit task ${task.title}`}
            className="button ghost"
            disabled={disabled || saving}
            onClick={() => setEditing(true)}
            type="button"
          >
            Edit
          </button>}
        </>
      )}
      {!readOnly && <div className="reorder-controls">
        <button
          aria-label={`Move task ${task.title} up`}
          className="icon-button"
          disabled={first || saving || disabled}
          onClick={() => void move("up")}
          type="button"
        >
          ↑
        </button>
        <button
          aria-label={`Move task ${task.title} down`}
          className="icon-button"
          disabled={last || saving || disabled}
          onClick={() => void move("down")}
          type="button"
        >
          ↓
        </button>
      </div>}
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </li>
  );
}
