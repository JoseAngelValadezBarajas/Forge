import { useState } from "react";
import type { FormEvent } from "react";
import {
  type Epic,
  type FeaturePriority,
  type FeatureStatus,
} from "../../../api";
import { Button } from "../../../shared/ui/Button";
import { FormField } from "../../../shared/ui/FormField";
import { IconButton } from "../../../shared/ui/IconButton";
import { Select } from "../../../shared/ui/Select";
import { Textarea } from "../../../shared/ui/Textarea";
import { TextInput } from "../../../shared/ui/TextInput";
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
  initialEpicId,
  onSubmit,
  onCancel,
  actionPending,
}: {
  epics: Epic[];
  initialEpicId?: string;
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
  const [epicId, setEpicId] = useState(initialEpicId ?? "");
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
        <IconButton
          aria-label="Close create feature"
          onClick={onCancel}
        >
          x
        </IconButton>
      </div>
      <div className="form-grid">
        <FormField label="Title">
          <TextInput
            autoFocus
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </FormField>
        <FormField label="Priority">
          <Select
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
          </Select>
        </FormField>
        <FormField label="Initial state">
          <Select
            onChange={(event) => setStatus(event.target.value as FeatureStatus)}
            value={status}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Epic">
          <Select
            onChange={(event) => setEpicId(event.target.value)}
            value={epicId}
          >
            <option value="">Unassigned</option>
            {epics.map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.title}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField className="wide-field" label="Goal">
          <Textarea
            onChange={(event) => setGoal(event.target.value)}
            rows={2}
            value={goal}
          />
        </FormField>
        <FormField className="wide-field" label="Description">
          <Textarea
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            value={description}
          />
        </FormField>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button loading={actionPending} loadingLabel="Creating..." type="submit" variant="primary">Create feature</Button>
      </div>
    </form>
  );
}
