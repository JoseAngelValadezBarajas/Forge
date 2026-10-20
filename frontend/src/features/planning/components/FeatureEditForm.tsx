import { useState } from "react";
import type { FormEvent } from "react";
import {
  type Epic,
  type Feature,
  type FeaturePriority,
  type FeatureStatus,
} from "../../../api";
import { Button } from "../../../shared/ui/Button";
import { FormField } from "../../../shared/ui/FormField";
import { Select } from "../../../shared/ui/Select";
import { Textarea } from "../../../shared/ui/Textarea";
import { TextInput } from "../../../shared/ui/TextInput";
import { type FeatureFormPayload } from "./FeatureCreateForm";
import { label, priorities, statuses } from "../utils";

export function FeatureEditForm({
  feature,
  epics,
  id,
  onSubmit,
  actionPending,
}: {
  feature: Feature;
  epics: Epic[];
  onSubmit: (payload: FeatureFormPayload) => Promise<boolean>;
  actionPending: boolean;
  id?: string;
}) {
  const [title, setTitle] = useState(feature.title);
  const [description, setDescription] = useState(feature.description ?? "");
  const [goal, setGoal] = useState(feature.goal ?? "");
  const [priority, setPriority] = useState<FeaturePriority>(feature.priority);
  const [status, setStatus] = useState<FeatureStatus>(feature.status);
  const [epicId, setEpicId] = useState(feature.epic_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Feature title is required.");
      return;
    }
    setError(null);
    const saved = await onSubmit({
      title,
      description,
      goal,
      priority,
      status,
      ...(epicId ? { epic_id: epicId } : { clear_epic: true }),
    });
    if (!saved) setError("Could not save feature. Try again.");
  };
  return (
    <form
      id={id}
      className="planning-form feature-edit-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="section-heading">
        <div>
          <span className="mono-label">{feature.key}</span>
          <h2>Edit feature</h2>
        </div>
        <span className="planning-disclaimer">Manual planning state</span>
      </div>
      <div className="form-grid">
        <FormField label="Title">
          <TextInput
            aria-label="Feature title"
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </FormField>
        <FormField label="Priority">
          <Select
            aria-label="Feature priority"
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
        <FormField label="Status">
          <Select
            aria-label="Feature state"
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
            aria-label="Feature epic"
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
            aria-label="Feature goal"
            onChange={(event) => setGoal(event.target.value)}
            rows={2}
            value={goal}
          />
        </FormField>
        <FormField className="wide-field" label="Description">
          <Textarea
            aria-label="Feature description"
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
        <Button loading={actionPending} loadingLabel="Saving..." type="submit" variant="primary">Save feature</Button>
      </div>
    </form>
  );
}
