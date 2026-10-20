import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../../shared/ui/Button";
import { FormField } from "../../../shared/ui/FormField";
import { IconButton } from "../../../shared/ui/IconButton";
import { Textarea } from "../../../shared/ui/Textarea";
import { TextInput } from "../../../shared/ui/TextInput";

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
        <IconButton
          aria-label="Close create epic"
          onClick={onCancel}
        >
          x
        </IconButton>
      </div>
      <FormField label="Title">
        <TextInput
          autoFocus
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      </FormField>
      <FormField label="Description">
        <Textarea
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          value={description}
        />
      </FormField>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button loading={actionPending} loadingLabel="Creating..." type="submit" variant="primary">Create epic</Button>
      </div>
    </form>
  );
}
