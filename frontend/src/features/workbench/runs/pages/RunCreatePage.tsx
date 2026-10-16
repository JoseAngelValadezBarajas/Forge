/* API-loading effects synchronize external SQLite-backed state and are guarded by AbortController. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  forgeApi,
  type ContextPackage,
  type Feature,
  type Project,
  type Workspace,
} from "../../../../api";
import { PageFrame } from "../../../../shared/ui/PageFrame";
import { type PaletteOpener } from "../../pages/types";
import { errorMessage } from "../../utils";
import { ErrorBox } from "../../components/ErrorBox";
import { StatusChip } from "../../components/StatusChip";

export function RunCreatePage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [packages, setPackages] = useState<ContextPackage[]>([]);
  const [projectId, setProjectId] = useState(searchParams.get("project") ?? "");
  const [featureId, setFeatureId] = useState(searchParams.get("feature") ?? "");
  const [packageId, setPackageId] = useState("");
  const [title, setTitle] = useState("");
  const [executorLabel, setExecutorLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!workspace) return;
    const controller = new AbortController();
    void forgeApi
      .listProjects(workspace.id, "", "active", controller.signal)
      .then((items) => {
        setProjects(items);
        if (!projectId && items[0]) setProjectId(items[0].id);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(errorMessage(cause, "Could not load projects."));
      });
    return () => controller.abort();
  }, [projectId, workspace]);
  useEffect(() => {
    if (!workspace || !projectId) {
      setFeatures([]);
      return;
    }
    const controller = new AbortController();
    void forgeApi
      .listFeatures(workspace.id, projectId, {}, controller.signal)
      .then((items) => {
        setFeatures(items);
        if (!items.some((item) => item.id === featureId))
          setFeatureId(items[0]?.id ?? "");
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(errorMessage(cause, "Could not load features."));
      });
    return () => controller.abort();
  }, [featureId, projectId, workspace]);
  useEffect(() => {
    if (!workspace || !projectId || !featureId) {
      setPackages([]);
      return;
    }
    const controller = new AbortController();
    void forgeApi
      .listContextPackages(
        workspace.id,
        projectId,
        featureId,
        controller.signal,
      )
      .then((items) => {
        setPackages(items);
        setPackageId((current) =>
          items.some((item) => item.id === current)
            ? current
            : (items[0]?.id ?? ""),
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(errorMessage(cause, "Could not load Context Packages."));
      });
    return () => controller.abort();
  }, [featureId, projectId, workspace]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || !projectId || !featureId || !packageId || !title.trim()) {
      setError("Choose a Feature, a saved Context Package and a run title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const run = await forgeApi.createRun(workspace.id, projectId, {
        feature_id: featureId,
        context_package_id: packageId,
        title: title.trim(),
        executor_label: executorLabel.trim() || undefined,
      });
      navigate(`/projects/${projectId}/runs/${run.id}`);
    } catch (cause) {
      setError(errorMessage(cause, "Could not record the run."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Explicitly document a human or agent-assisted work session; no execution is launched."
      title="Record a New Run"
    >
      <div className="fnd05-stepper">
        01 Scope &amp; context <span>→</span> 02 Run details <span>→</span> 03
        Review &amp; record
      </div>
      {error && <ErrorBox message={error} />}
      <form className="fnd05-form" onSubmit={submit}>
        <div className="fnd05-panel">
          <span className="eyebrow accent">KNOWN FEATURE</span>
          <h2>Start with a known Feature</h2>
          <p>
            Select a saved Context Package as the exact input for this record.
          </p>
          <label>
            Project
            <select
              aria-label="Project"
              onChange={(event) => {
                setProjectId(event.target.value);
                setFeatureId("");
                setPackageId("");
              }}
              value={projectId}
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Feature
            <select
              aria-label="Feature"
              disabled={!features.length}
              onChange={(event) => {
                setFeatureId(event.target.value);
                setPackageId("");
              }}
              value={featureId}
            >
              {features.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.key} · {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Context Package
            <select
              aria-label="Context Package"
              disabled={!packages.length}
              onChange={(event) => setPackageId(event.target.value)}
              value={packageId}
            >
              {packages.map((item) => (
                <option key={item.id ?? "package"} value={item.id ?? ""}>
                  {item.schema_version} / {item.fingerprint.slice(0, 16)}…
                </option>
              ))}
            </select>
          </label>
          <div className="fnd05-callout">
            <span className="eyebrow">IMMUTABLE INPUT</span>
            <p>
              {packages.length
                ? "The run will always reference this saved fingerprint."
                : "Save a Context Package from Feature Context before recording a run."}
            </p>
          </div>
          <label>
            Run title
            <input
              aria-label="Run title"
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Implement workspace export"
              value={title}
            />
          </label>
          <label>
            Executor label <span className="field-hint">Optional</span>
            <input
              aria-label="Executor label"
              onChange={(event) => setExecutorLabel(event.target.value)}
              placeholder="Human / External tool"
              value={executorLabel}
            />
          </label>
          <div className="form-actions">
            <Link className="button secondary" to="/workbench">
              Cancel
            </Link>
            <button
              className="button primary"
              disabled={saving || !packages.length}
              type="submit"
            >
              {saving ? "Recording…" : "Record run →"}
            </button>
          </div>
        </div>
        <aside className="fnd05-panel fnd05-guidance">
          <h2>What this does</h2>
          <p>Records intent, provenance and the exact planning context used.</p>
          <hr />
          <h3>It does not</h3>
          <ul>
            <li>Start an agent or local process.</li>
            <li>Read chats from another app.</li>
            <li>Validate work or CI results.</li>
          </ul>
          <StatusChip status="MANUAL REPORT" />
        </aside>
      </form>
    </PageFrame>
  );
}
