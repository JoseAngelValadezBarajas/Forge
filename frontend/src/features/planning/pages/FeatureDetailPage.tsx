import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  forgeApi,
  type AcceptanceCriterion,
  type Epic,
  type Feature,
  type FeatureDependency,
  type Task,
  type TaskStatus,
  type Workspace,
} from "../../../api";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { ReadinessPanel } from "../../readiness";
import { errorMessage, moveIds } from "../utils";
import { type FeatureFormPayload } from "../components/FeatureCreateForm";
import { FeatureEditForm } from "../components/FeatureEditForm";
import { TaskRow } from "../components/TaskRow";
import { CriterionRow } from "../components/CriterionRow";
import { DependencyGroup } from "../components/DependencyGroup";

type FeatureDetailProps = {
  workspace: Workspace | null;
  onOpenPalette: (button: HTMLButtonElement) => void;
};

export function FeatureDetailPage({
  workspace,
  onOpenPalette,
}: FeatureDetailProps) {
  const { projectId, featureId } = useParams<{
    projectId: string;
    featureId: string;
  }>();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [dependencies, setDependencies] = useState<FeatureDependency[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [readinessRefreshKey, setReadinessRefreshKey] = useState(0);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newCriterionDescription, setNewCriterionDescription] = useState("");
  const [dependencyTarget, setDependencyTarget] = useState("");
  const [dependencyDirection, setDependencyDirection] = useState<
    "blocked_by" | "blocks"
  >("blocked_by");
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspace || !projectId || !featureId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        nextFeature,
        nextEpics,
        nextTasks,
        nextCriteria,
        nextDependencies,
        nextFeatures,
      ] = await Promise.all([
        forgeApi.getFeature(
          workspace.id,
          projectId,
          featureId,
          controller.signal,
        ),
        forgeApi.listEpics(workspace.id, projectId, controller.signal),
        forgeApi.listTasks(
          workspace.id,
          projectId,
          featureId,
          controller.signal,
        ),
        forgeApi.listCriteria(
          workspace.id,
          projectId,
          featureId,
          controller.signal,
        ),
        forgeApi.listDependencies(workspace.id, projectId, controller.signal),
        forgeApi.listFeatures(workspace.id, projectId, {}, controller.signal),
      ]);
      if (currentRequest !== requestId.current) return;
      setFeature(nextFeature);
      setEpics(nextEpics);
      setTasks(nextTasks);
      setCriteria(nextCriteria);
      setDependencies(nextDependencies);
      setFeatures(nextFeatures);
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || currentRequest !== requestId.current)
        return;
      setError(errorMessage(cause, "Could not load feature."));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [featureId, projectId, workspace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
    };
  }, [load]);

  const performMutation = async (
    action: () => Promise<void>,
    fallback: string,
  ): Promise<boolean> => {
    if (mutationPending) return false;
    setMutationPending(true);
    setActionError(null);
    try {
      await action();
      await load();
      setReadinessRefreshKey((current) => current + 1);
      return true;
    } catch (cause) {
      setActionError(errorMessage(cause, fallback));
      return false;
    } finally {
      setMutationPending(false);
    }
  };

  const saveFeature = (payload: FeatureFormPayload): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(
      () =>
        forgeApi
          .updateFeature(workspace.id, projectId, featureId, payload)
          .then(() => undefined),
      "Could not save feature.",
    );
  };
  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) {
      setActionError("Task title is required.");
      return;
    }
    if (!workspace || !projectId || !featureId) return;
    const saved = await performMutation(
      () =>
        forgeApi
          .createTask(workspace.id, projectId, featureId, { title })
          .then(() => undefined),
      "Could not create task.",
    );
    if (saved) setNewTaskTitle("");
  };
  const addCriterion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const description = newCriterionDescription.trim();
    if (!description) {
      setActionError("Acceptance criterion is required.");
      return;
    }
    if (!workspace || !projectId || !featureId) return;
    const saved = await performMutation(
      () =>
        forgeApi
          .createCriterion(workspace.id, projectId, featureId, { description })
          .then(() => undefined),
      "Could not create acceptance criterion.",
    );
    if (saved) setNewCriterionDescription("");
  };
  const saveTask = (
    task: Task,
    payload: { title: string; description: string; status: TaskStatus },
  ): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(
      () =>
        forgeApi
          .updateTask(workspace.id, projectId, featureId, task.id, payload)
          .then(() => undefined),
      "Could not save task.",
    );
  };
  const reorderTasks = (ids: string[]): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(
      () =>
        forgeApi
          .reorderTasks(workspace.id, projectId, featureId, ids)
          .then(() => undefined),
      "Could not reorder tasks.",
    );
  };
  const saveCriterion = (
    criterion: AcceptanceCriterion,
    payload: { description: string; satisfied: boolean },
  ): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(
      () =>
        forgeApi
          .updateCriterion(
            workspace.id,
            projectId,
            featureId,
            criterion.id,
            payload,
          )
          .then(() => undefined),
      "Could not save acceptance criterion.",
    );
  };
  const reorderCriteria = (ids: string[]): Promise<boolean> => {
    if (!workspace || !projectId || !featureId) return Promise.resolve(false);
    return performMutation(
      () =>
        forgeApi
          .reorderCriteria(workspace.id, projectId, featureId, ids)
          .then(() => undefined),
      "Could not reorder acceptance criteria.",
    );
  };
  const addDependency = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = dependencyTarget;
    const direction = dependencyDirection;
    if (!target) {
      setActionError("Select a feature dependency first.");
      return;
    }
    if (!workspace || !projectId || !featureId) return;
    const payload =
      direction === "blocked_by"
        ? { blocking_feature_id: target, blocked_feature_id: featureId }
        : { blocking_feature_id: featureId, blocked_feature_id: target };
    const saved = await performMutation(
      () =>
        forgeApi
          .createDependency(workspace.id, projectId, payload)
          .then(() => undefined),
      "Could not create dependency.",
    );
    if (saved) {
      setDependencyTarget("");
      setDependencyDirection("blocked_by");
    }
  };
  const removeDependency = (id: string): Promise<boolean> => {
    if (!workspace || !projectId) return Promise.resolve(false);
    return performMutation(
      () => forgeApi.deleteDependency(workspace.id, projectId, id),
      "Could not remove dependency.",
    );
  };

  const dependencyLabel = (id: string) => {
    const item = features.find((candidate) => candidate.id === id);
    return item ? `${item.key} · ${item.title}` : "Unknown feature";
  };
  const otherFeatures = useMemo(
    () => features.filter((item) => item.id !== featureId),
    [featureId, features],
  );
  const blockedBy = dependencies.filter(
    (dependency) => dependency.blocked_feature_id === featureId,
  );
  const blocks = dependencies.filter(
    (dependency) => dependency.blocking_feature_id === featureId,
  );

  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Intent, tasks and manual acceptance criteria for one feature."
      title={feature ? `${feature.key} · ${feature.title}` : "Feature detail"}
    >
      <div className="planning-tabs">
        <Link className="detail-tab" to={`/projects/${projectId}/board`}>
          Board
        </Link>
        <Link
          className="detail-tab active"
          to={`/projects/${projectId}/features/${featureId}`}
        >
          Feature detail
        </Link>
        <Link
          className="detail-tab"
          to={`/projects/${projectId}/features/${featureId}/context`}
        >
          Context
        </Link>
        <Link className="detail-tab" to={`/projects/${projectId}`}>
          Overview
        </Link>
      </div>
      {loading ? (
        <LoadingPanel label="Loading feature" />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : feature ? (
        <>
          <FeatureEditForm
            key={`${feature.id}-${feature.updated_at}`}
            actionPending={mutationPending}
            epics={epics}
            feature={feature}
            onSubmit={saveFeature}
          />
          {actionError && (
            <div className="feedback-panel error-panel" role="alert">
              <span>{actionError}</span>
              <button
                className="button ghost"
                onClick={() => setActionError(null)}
                type="button"
              >
                Dismiss
              </button>
            </div>
          )}
          {workspace && projectId && (
            <ReadinessPanel
              feature={feature}
              projectId={projectId}
              refreshKey={readinessRefreshKey}
              workspace={workspace}
            />
          )}
          <div className="feature-detail-grid">
            <section className="detail-section">
              <div className="section-heading">
                <h2>Tasks</h2>
                <span>{tasks.length}</span>
              </div>
              <form
                className="inline-add"
                onSubmit={(event) => void addTask(event)}
              >
                <input
                  aria-label="New task"
                  name="title"
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  placeholder="Add a task"
                  value={newTaskTitle}
                />
                <button
                  className="button secondary"
                  disabled={mutationPending}
                  type="submit"
                >
                  Add
                </button>
              </form>
              {tasks.length ? (
                <ul className="planning-list">
                  {tasks.map((task, index) => (
                    <TaskRow
                      disabled={mutationPending}
                      first={index === 0}
                      key={task.id}
                      last={index === tasks.length - 1}
                      onMove={(direction) =>
                        reorderTasks(moveIds(tasks, index, direction))
                      }
                      onSave={(payload) => saveTask(task, payload)}
                      task={task}
                    />
                  ))}
                </ul>
              ) : (
                <div className="quiet-empty-row">
                  Break the feature into small, local tasks.
                </div>
              )}
            </section>
            <section className="detail-section">
              <div className="section-heading">
                <h2>Acceptance criteria</h2>
                <span>
                  {criteria.filter((item) => item.satisfied).length} /{" "}
                  {criteria.length} satisfied
                </span>
              </div>
              <p className="planning-disclaimer">
                Manual declaration only; this is not verification evidence.
              </p>
              <form
                className="inline-add"
                onSubmit={(event) => void addCriterion(event)}
              >
                <input
                  aria-label="New acceptance criterion"
                  name="description"
                  onChange={(event) =>
                    setNewCriterionDescription(event.target.value)
                  }
                  placeholder="Add an acceptance criterion"
                  value={newCriterionDescription}
                />
                <button
                  className="button secondary"
                  disabled={mutationPending}
                  type="submit"
                >
                  Add
                </button>
              </form>
              {criteria.length ? (
                <ul className="planning-list criteria-list">
                  {criteria.map((criterion, index) => (
                    <CriterionRow
                      criterion={criterion}
                      disabled={mutationPending}
                      first={index === 0}
                      key={criterion.id}
                      last={index === criteria.length - 1}
                      onMove={(direction) =>
                        reorderCriteria(moveIds(criteria, index, direction))
                      }
                      onSave={(payload) => saveCriterion(criterion, payload)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="quiet-empty-row">No criteria declared yet.</div>
              )}
            </section>
          </div>
          <section className="detail-section dependencies-section">
            <div className="section-heading">
              <h2>Dependencies</h2>
              <span>{dependencies.length}</span>
            </div>
            <form
              className="dependency-form"
              onSubmit={(event) => void addDependency(event)}
            >
              <label>
                Relationship
                <select
                  aria-label="Dependency relationship"
                  onChange={(event) =>
                    setDependencyDirection(
                      event.target.value as "blocked_by" | "blocks",
                    )
                  }
                  value={dependencyDirection}
                >
                  <option value="blocked_by">Blocked by</option>
                  <option value="blocks">Blocks</option>
                </select>
              </label>
              <label>
                Feature
                <select
                  aria-label="Dependency feature"
                  onChange={(event) => setDependencyTarget(event.target.value)}
                  value={dependencyTarget}
                >
                  <option value="">Select feature</option>
                  {otherFeatures.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.key} · {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button secondary"
                disabled={mutationPending}
                type="submit"
              >
                Add dependency
              </button>
            </form>
            <div className="dependency-groups">
              <DependencyGroup
                disabled={mutationPending}
                items={blockedBy}
                labelText="Blocked by"
                onRemove={removeDependency}
                resolve={dependencyLabel}
                empty="No features block this feature."
              />
              <DependencyGroup
                disabled={mutationPending}
                items={blocks}
                labelText="Blocks"
                onRemove={removeDependency}
                resolve={dependencyLabel}
                empty="This feature blocks nothing yet."
              />
            </div>
          </section>
        </>
      ) : null}
    </PageFrame>
  );
}
