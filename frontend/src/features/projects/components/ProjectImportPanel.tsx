import { useState } from "react";
import type { ChangeEvent } from "react";
import {
  forgeApi,
  type ProjectImportDocument,
  type ProjectImportPreview,
  type Workspace,
} from "../../../api";
import { transferErrorMessage } from "../../../shared/api/errors";

type ImportState = "idle" | "previewing" | "ready" | "importing" | "failed";
type ImportStage = "select" | "review" | "confirm";

const PREVIEW_FEATURE_LIMIT = 20;
const PREVIEW_CHILD_LIMIT = 20;

type ImportFeature = NonNullable<ProjectImportDocument["features"]>[number];

function visibleItems<T>(items: T[] | undefined, limit: number): T[] {
  return (items ?? []).slice(0, limit);
}

function stageFor(preview: ProjectImportPreview | null, state: ImportState): ImportStage {
  if (!preview) return "select";
  return state === "importing" || state === "failed" ? "confirm" : "review";
}

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

  const stage = stageFor(preview, state);

  const resetPreview = (nextSource: string) => {
    setSource(nextSource);
    setPreview(null);
    setError(null);
    setState("idle");
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setFileName(file.name);
      resetPreview(await file.text());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read the selected file.",
      );
    }
  };

  const previewImport = async () => {
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
      setError(transferErrorMessage(cause).message);
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
      setState("failed");
      setError(transferErrorMessage(cause).message);
    }
  };

  const epics = preview?.document.epics ?? [];
  const features = preview?.document.features ?? [];
  const dependencies = preview?.document.dependencies ?? [];
  const epicByRef = new Map(epics.map((epic) => [epic.ref, epic.title]));
  const featureByRef = new Map(features.map((feature) => [feature.ref, feature.title]));
  const visibleFeatures = visibleItems(features, PREVIEW_FEATURE_LIMIT);
  const featuresForEpic = (epicRef: string) =>
    visibleFeatures.filter((feature) => feature.epic_ref === epicRef);
  const unassignedFeatures = visibleFeatures.filter(
    (feature) => !feature.epic_ref || !epicByRef.has(feature.epic_ref),
  );

  const renderFeature = (feature: ImportFeature) => {
    const tasks = feature.tasks ?? [];
    const criteria = feature.acceptance_criteria ?? [];
    const epicName = feature.epic_ref
      ? epicByRef.get(feature.epic_ref) ?? feature.epic_ref
      : "Unassigned";
    return (
      <li className="import-preview-node" key={feature.ref}>
        <details open>
          <summary>
            <span>{feature.title}</span>
            <span className="mono-label">{feature.ref}</span>
          </summary>
          <p className="import-preview-association">Epic: {epicName}</p>
          <div className="import-preview-columns">
            <section aria-labelledby={`${feature.ref}-tasks`}>
              <h5 id={`${feature.ref}-tasks`}>Tasks ({tasks.length})</h5>
              {tasks.length ? (
                <ul>
                  {visibleItems(tasks, PREVIEW_CHILD_LIMIT).map((task) => (
                    <li key={task.ref}>{task.title}</li>
                  ))}
                </ul>
              ) : (
                <p className="field-hint">No tasks</p>
              )}
              {tasks.length > PREVIEW_CHILD_LIMIT && (
                <p className="field-hint">
                  Showing {PREVIEW_CHILD_LIMIT} of {tasks.length} tasks
                </p>
              )}
            </section>
            <section aria-labelledby={`${feature.ref}-criteria`}>
              <h5 id={`${feature.ref}-criteria`}>Acceptance Criteria ({criteria.length})</h5>
              {criteria.length ? (
                <ul>
                  {visibleItems(criteria, PREVIEW_CHILD_LIMIT).map((criterion) => (
                    <li key={criterion.ref}>{criterion.description}</li>
                  ))}
                </ul>
              ) : (
                <p className="field-hint">No acceptance criteria</p>
              )}
              {criteria.length > PREVIEW_CHILD_LIMIT && (
                <p className="field-hint">
                  Showing {PREVIEW_CHILD_LIMIT} of {criteria.length} acceptance criteria
                </p>
              )}
            </section>
          </div>
        </details>
      </li>
    );
  };

  return (
    <section aria-labelledby="project-import-title" className="transfer-screen form-panel import-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PROJECTS / TRANSFER</span>
          <h2 id="project-import-title">
            {stage === "select" ? "Import project" : stage === "review" ? "Review project" : "Confirm import"}
          </h2>
        </div>
        <button aria-label="Close import project" className="icon-button" onClick={onClose} type="button">
          x
        </button>
      </div>
      <p className="transfer-subtitle">
        {stage === "select"
          ? "Bring a planning snapshot into this workspace. Nothing is saved until you confirm."
          : stage === "review"
            ? "Inspect the validated planning context before creating the Project."
            : "Confirm the validated snapshot to create the Project transactionally."}
      </p>
      <ol aria-label="Import progress" className="transfer-stepper">
        {(["select", "review", "confirm"] as const).map((item, index) => (
          <li
            className={
              stage === item
                ? "active"
                : index < ["select", "review", "confirm"].indexOf(stage)
                  ? "complete"
                  : ""
            }
            key={item}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>
              {item === "select" ? "Select source" : item === "review" ? "Review planning" : "Confirm"}
            </strong>
          </li>
        ))}
      </ol>

      {!preview ? (
        <div className="transfer-grid">
          <section className="transfer-card transfer-source-card" aria-labelledby="import-source-title">
            <span className="eyebrow accent">01 / SELECT SOURCE</span>
            <h3 id="import-source-title">Choose a planning snapshot</h3>
            <p className="field-hint">
              Accepted: forge-project-import-v1 JSON. Maximum document size is 8 MiB.
            </p>
            <label className="file-picker">
              Choose JSON file
              <input
                accept="application/json,.json"
                aria-label="Choose project JSON file"
                onChange={(event) => void loadFile(event)}
                type="file"
              />
            </label>
            {fileName && <p className="field-hint">Selected: {fileName}</p>}
            <label className="transfer-json-label">
              Or paste JSON
              <textarea
                aria-label="Project import JSON"
                className="import-json-input"
                onChange={(event) => resetPreview(event.target.value)}
                placeholder='{ "schema_version": "forge-project-import-v1", ... }'
                rows={10}
                value={source}
              />
            </label>
          </section>
          <section className="transfer-card transfer-context-card" aria-labelledby="import-context-title">
            <span className="eyebrow">DESTINATION</span>
            <h3 id="import-context-title">{workspace?.name ?? "No workspace selected"}</h3>
            <dl className="transfer-facts">
              <div><dt>Creates</dt><dd>New Project</dd></div>
              <div><dt>Included</dt><dd>Epics, Features, dependencies, Tasks and criteria</dd></div>
              <div><dt>Not included</dt><dd>Repositories, Runs, Decisions, Evidence and releases</dd></div>
            </dl>
            <p className="planning-disclaimer">
              Imported planning is not implementation evidence or a verification result.
            </p>
          </section>
        </div>
      ) : (
        <div className="transfer-review-layout">
          <div className="transfer-review-main">
            <section aria-live="polite" className="import-preview" role="status">
              <div className="transfer-review-heading">
                <div>
                  <span className="eyebrow accent">02 / REVIEW PLANNING</span>
                  <h3>Preview validated</h3>
                  <p className="transfer-project-name">{preview.document.project.name}</p>
                </div>
                <span className="transfer-ready-badge">
                  {preview.project_name_conflict
                    ? "Name conflict"
                    : state === "importing"
                      ? "Creating..."
                      : state === "failed"
                        ? "Preview preserved"
                      : "Ready to create"}
                </span>
              </div>
              <ul className="transfer-counts" aria-label="Project import counts">
                <li><strong>{preview.counts.epics}</strong><span>Epics</span><span className="sr-only">{preview.counts.epics} epics</span></li>
                <li><strong>{preview.counts.features}</strong><span>Features</span><span className="sr-only">{preview.counts.features} features</span></li>
                <li><strong>{preview.counts.tasks}</strong><span>Tasks</span><span className="sr-only">{preview.counts.tasks} tasks</span></li>
                <li><strong>{preview.counts.acceptance_criteria}</strong><span>Criteria</span><span className="sr-only">{preview.counts.acceptance_criteria} acceptance criteria</span></li>
                <li><strong>{preview.counts.dependencies}</strong><span>Dependencies</span><span className="sr-only">{preview.counts.dependencies} dependencies</span></li>
              </ul>
              <code>Fingerprint: {preview.fingerprint}</code>
              <div className="import-preview-tree" aria-label="Project import hierarchy">
                <h4>Planning hierarchy</h4>
                <p className="field-hint">
                  Expand each Epic or Feature to inspect names, associations, Tasks, criteria and dependencies.
                </p>
                {epics.length ? (
                  <ol>
                    {visibleItems(epics, PREVIEW_FEATURE_LIMIT).map((epic) => (
                      <li className="import-preview-node" key={epic.ref}>
                        <details open>
                          <summary>
                            <span>{epic.title}</span>
                            <span className="mono-label">{epic.ref}</span>
                          </summary>
                          {featuresForEpic(epic.ref).length ? (
                            <ol>{featuresForEpic(epic.ref).map(renderFeature)}</ol>
                          ) : (
                            <p className="field-hint">No features in this Epic</p>
                          )}
                        </details>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {unassignedFeatures.length ? (
                  <section>
                    <h5>Features without a listed Epic</h5>
                    <ol>{unassignedFeatures.map(renderFeature)}</ol>
                  </section>
                ) : null}
                {features.length > PREVIEW_FEATURE_LIMIT && (
                  <p className="field-hint">Showing {PREVIEW_FEATURE_LIMIT} of {features.length} features</p>
                )}
                <section>
                  <h5>Dependencies ({dependencies.length})</h5>
                  {dependencies.length ? (
                    <ul>
                      {visibleItems(dependencies, PREVIEW_CHILD_LIMIT).map((dependency) => (
                        <li key={`${dependency.blocking_feature_ref}-${dependency.blocked_feature_ref}`}>
                          {`${featureByRef.get(dependency.blocking_feature_ref) ?? dependency.blocking_feature_ref} → ${featureByRef.get(dependency.blocked_feature_ref) ?? dependency.blocked_feature_ref}`}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="field-hint">No feature dependencies</p>}
                  {dependencies.length > PREVIEW_CHILD_LIMIT && (
                    <p className="field-hint">Showing {PREVIEW_CHILD_LIMIT} of {dependencies.length} dependencies</p>
                  )}
                </section>
              </div>
            </section>
          </div>
          <aside className="transfer-card transfer-review-side" aria-label="Import review details">
            <span className="eyebrow">REVIEW STATUS</span>
            <h3>
              {preview.project_name_conflict
                ? "Resolve project name"
                : state === "failed"
                  ? "Preview preserved"
                  : state === "importing"
                    ? "Creating project"
                    : "Ready to create"}
            </h3>
            <dl className="transfer-facts">
              <div><dt>Workspace</dt><dd>{workspace?.name ?? preview.workspace_id}</dd></div>
              <div><dt>Import type</dt><dd>Planning only</dd></div>
              <div><dt>Associations</dt><dd>Local references resolved on import</dd></div>
            </dl>
            <p className="planning-disclaimer">
              Acceptance criteria are declarations, not verified evidence. Existing records are not modified.
            </p>
          </aside>
        </div>
      )}

      {error && (
        <div aria-live="assertive" className="transfer-error" role="alert">
          <strong>{preview ? "Import needs attention" : "Import could not be previewed"}</strong>
          <p>{error}</p>
          {preview && <p>The validated plan is preserved. No partial Project has been created.</p>}
        </div>
      )}
      <div className="transfer-footer form-actions">
        <span className="transfer-footer-status">
          Step {stage === "select" ? 1 : stage === "review" ? 2 : 3} of 3 · Nothing has been saved
        </span>
        <div className="detail-actions">
          <button className="button secondary" onClick={onClose} type="button">Cancel</button>
          {preview ? (
            <button
              className="button secondary"
              disabled={state === "importing"}
              onClick={() => {
                if (state === "failed") {
                  setError(null);
                  setState("ready");
                } else {
                  resetPreview(source);
                }
              }}
              type="button"
            >
              {state === "failed" ? "Back to preview" : "Back to source"}
            </button>
          ) : (
            <button
              aria-label="Preview import"
              className="button primary"
              disabled={!source.trim() || state === "previewing"}
              onClick={() => void previewImport()}
              type="button"
            >
              {state === "previewing" ? "Validating..." : "Preview project"}
            </button>
          )}
          {preview && (
            <button
              className="button primary"
              disabled={preview.project_name_conflict || !["ready", "failed"].includes(state)}
              onClick={() => void confirmImport()}
              type="button"
            >
              {state === "importing" ? "Importing..." : state === "failed" ? "Try again" : "Confirm import"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
