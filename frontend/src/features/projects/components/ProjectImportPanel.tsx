import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  forgeApi,
  type ProjectImportDocument,
  type ProjectImportPreview,
  type Workspace,
} from "../../../api";

type ImportState = "idle" | "previewing" | "ready" | "importing";

export function ProjectImportPanel({
  workspace,
  onClose,
  onImported,
}: {
  workspace: Workspace | null;
  onClose: () => void;
  onImported: (projectId: string) => void;
}) {
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProjectImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ImportState>("idle");

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setSource(await file.text());
      setFileName(file.name);
      setPreview(null);
      setError(null);
      setState("idle");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read the selected file.",
      );
    }
  };

  const previewImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace) {
      setError("Select a workspace before importing a project.");
      return;
    }
    let document: ProjectImportDocument;
    try {
      document = JSON.parse(source) as ProjectImportDocument;
    } catch {
      setError("The pasted content is not valid JSON.");
      setPreview(null);
      return;
    }
    setState("previewing");
    setError(null);
    try {
      const result = await forgeApi.previewProjectImport(workspace.id, document);
      setPreview(result);
      setState("ready");
    } catch (cause) {
      setPreview(null);
      setState("idle");
      setError(
        cause instanceof Error ? cause.message : "Forge could not validate this project.",
      );
    }
  };

  const confirmImport = async () => {
    if (!workspace || !preview || state === "importing") return;
    setState("importing");
    setError(null);
    try {
      const result = await forgeApi.importProject(
        workspace.id,
        preview.document,
        preview.fingerprint,
      );
      onImported(result.project_id);
    } catch (cause) {
      setState("ready");
      setError(
        cause instanceof Error ? cause.message : "Forge could not import this project.",
      );
    }
  };

  return (
    <section aria-labelledby="project-import-title" className="form-panel import-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">VERSIONED TRANSFER</span>
          <h2 id="project-import-title">Import project</h2>
        </div>
        <button
          aria-label="Close import project"
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          x
        </button>
      </div>
      <p className="field-hint">
        Import planning only. Forge does not import repository, delivery, verification, or release evidence.
      </p>
      <label className="file-picker">
        Select a JSON file
        <input
          accept="application/json,.json"
          onChange={(event) => void loadFile(event)}
          type="file"
        />
      </label>
      {fileName && <p className="field-hint">Selected: {fileName}</p>}
      <label>
        Or paste the JSON document
        <textarea
          aria-label="Project import JSON"
          className="import-json-input"
          onChange={(event) => {
            setSource(event.target.value);
            setPreview(null);
            setState("idle");
          }}
          placeholder='{ "schema_version": "forge-project-import-v1", ... }'
          rows={12}
          value={source}
        />
      </label>
      {error && (
        <p aria-live="assertive" className="form-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div aria-live="polite" className="import-preview" role="status">
          <strong>Preview validated</strong>
          <p>{preview.document.project.name}</p>
          <ul>
            <li>{preview.counts.epics} epics</li>
            <li>{preview.counts.features} features</li>
            <li>{preview.counts.tasks} tasks</li>
            <li>{preview.counts.acceptance_criteria} acceptance criteria</li>
            <li>{preview.counts.dependencies} dependencies</li>
          </ul>
          {preview.project_name_conflict && (
            <p className="form-error">
              A project with this name already exists in this workspace.
            </p>
          )}
          <code>Fingerprint: {preview.fingerprint}</code>
        </div>
      )}
      <div className="form-actions">
        <button className="button secondary" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="button secondary"
          disabled={!source.trim() || state === "previewing" || state === "importing"}
          onClick={(event) => void previewImport(event)}
          type="button"
        >
          {state === "previewing" ? "Validating..." : "Preview import"}
        </button>
        <button
          className="button primary"
          disabled={!preview || preview.project_name_conflict || state !== "ready"}
          onClick={() => void confirmImport()}
          type="button"
        >
          {state === "importing" ? "Importing..." : "Confirm import"}
        </button>
      </div>
    </section>
  );
}
