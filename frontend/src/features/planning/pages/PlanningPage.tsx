import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  forgeApi,
  type Epic,
  type EpicStatus,
  type Feature,
  type FeaturePriority,
  type FeatureStatus,
  type Workspace,
} from "../../../api";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { ProjectBreadcrumbs } from "../../../shared/ui/ProjectBreadcrumbs";
import { usePlanningData, type PlanningFilters } from "../hooks/usePlanningData";
import { errorMessage, label, priorities } from "../utils";
import { FeatureCreateForm } from "../components/FeatureCreateForm";
import { EpicCreateForm } from "../components/EpicCreateForm";
import { EpicEditForm } from "../components/EpicEditForm";
import { Board } from "../components/Board";
import { FeatureInventory } from "../components/FeatureInventory";

export function PlanningPage({
  workspace,
  onOpenPalette,
  mode,
}: {
  workspace: Workspace | null;
  onOpenPalette: (button: HTMLButtonElement) => void;
  mode: "board" | "features";
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FeatureStatus | undefined>();
  const [priority, setPriority] = useState<FeaturePriority | undefined>();
  const [localCreateForm, setLocalCreateForm] = useState<
    "feature" | "epic" | null
  >(null);
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const epicFilter = useMemo(
    () => new URLSearchParams(location.search).get("epic") ?? undefined,
    [location.search],
  );
  const filters = useMemo<PlanningFilters>(
    () => ({ search, status, priority, epicId: epicFilter }),
    [epicFilter, priority, search, status],
  );
  const { data, loading, error, reload } = usePlanningData(workspace, projectId, filters);
  const navigate = useNavigate();
  const routeCreateForm = useMemo<"feature" | "epic" | null>(() => {
    const intent = new URLSearchParams(location.search).get("create");
    return intent === "1" ? "feature" : intent === "epic" ? "epic" : null;
  }, [location.search]);
  const createForm = routeCreateForm ?? localCreateForm;
  const clearCreateIntent = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("create")) return;
    params.delete("create");
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);
  const closeCreateForm = useCallback(() => {
    setLocalCreateForm(null);
    clearCreateIntent();
  }, [clearCreateIntent]);
  const clearFilters = () => {
    setSearch("");
    setStatus(undefined);
    setPriority(undefined);
    if (new URLSearchParams(location.search).has("epic")) {
      const params = new URLSearchParams(location.search);
      params.delete("epic");
      navigate(
        {
          pathname: location.pathname,
          search: params.toString() ? `?${params.toString()}` : "",
          hash: location.hash,
        },
        { replace: true },
      );
    }
  };

  const runMutation = async (
    action: () => Promise<void>,
    fallback: string,
  ): Promise<boolean> => {
    if (actionPending) return false;
    setActionPending(true);
    setActionError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (cause) {
      setActionError(errorMessage(cause, fallback));
      return false;
    } finally {
      setActionPending(false);
    }
  };

  const createFeature = async (payload: {
    title: string;
    description: string;
    goal: string;
    priority: FeaturePriority;
    status: FeatureStatus;
    epic_id?: string;
  }): Promise<boolean> => {
    if (!workspace || !projectId || actionPending) return false;
    setActionPending(true);
    setActionError(null);
    try {
      const feature = await forgeApi.createFeature(
        workspace.id,
        projectId,
        payload,
      );
      await reload();
      setLocalCreateForm(null);
      navigate(`/projects/${projectId}/features/${feature.id}`);
      return true;
    } catch (cause) {
      setActionError(errorMessage(cause, "Could not create feature."));
      return false;
    } finally {
      setActionPending(false);
    }
  };

  const createEpic = (title: string, description: string): Promise<boolean> => {
    if (!workspace || !projectId) return Promise.resolve(false);
    return runMutation(async () => {
      await forgeApi.createEpic(workspace.id, projectId, {
        title,
        description,
      });
      setLocalCreateForm(null);
      clearCreateIntent();
    }, "Could not create epic.");
  };

  const updateEpic = (
    epic: Epic,
    payload: { title: string; description: string; status: EpicStatus },
  ): Promise<boolean> => {
    if (!workspace || !projectId) return Promise.resolve(false);
    return runMutation(async () => {
      await forgeApi.updateEpic(workspace.id, projectId, epic.id, payload);
      setEditingEpic(null);
    }, "Could not update epic.");
  };

  const updateStatus = (
    feature: Feature,
    nextStatus: FeatureStatus,
  ): Promise<boolean> => {
    if (!workspace || !projectId || feature.status === nextStatus)
      return Promise.resolve(false);
    return runMutation(
      () =>
        forgeApi
          .updateFeature(workspace.id, projectId, feature.id, {
            status: nextStatus,
          })
          .then(() => undefined),
      "Could not update feature.",
    );
  };

  return (
    <PageFrame
      breadcrumbs={
        data?.project ? (
          <ProjectBreadcrumbs
            current={mode === "board" ? "Board" : "Features"}
            parent={{
              label: "Overview",
              to: `/projects/${data.project.id}`,
            }}
            project={data.project}
            workspace={workspace}
          />
        ) : undefined
      }
      onOpenPalette={onOpenPalette}
      subtitle="Manual planning state only. Verification and delivery evidence are separate milestones."
      title={mode === "board" ? "Project Board" : "Features & Epics"}
    >
      <div className="planning-toolbar">
        <div
          className="planning-tabs"
          role="tablist"
          aria-label="Project planning views"
        >
          <Link
            className={mode === "board" ? "detail-tab active" : "detail-tab"}
            to={`/projects/${projectId}/board`}
          >
            Board
          </Link>
          <Link
            className={mode === "features" ? "detail-tab active" : "detail-tab"}
            to={`/projects/${projectId}/features`}
          >
            Features
          </Link>
          <Link className="detail-tab" to={`/projects/${projectId}`}>
            Overview
          </Link>
        </div>
        <div className="planning-actions">
          <button
            className="button secondary"
            disabled={actionPending}
            onClick={() => setLocalCreateForm("epic")}
            type="button"
          >
            + Epic
          </button>
          <button
            className="button primary"
            disabled={actionPending}
            onClick={() => setLocalCreateForm("feature")}
            type="button"
          >
            + Feature
          </button>
        </div>
      </div>
      <section className="planning-filters" aria-label="Feature filters">
        <label className="search-field">
          Search features
          <input
            aria-label="Search features"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, goal or description"
            value={search}
          />
        </label>
        <label className="filter-field">
          Status
          <select
            aria-label="Feature workflow"
            onChange={(event) =>
              setStatus(
                event.target.value
                  ? (event.target.value as FeatureStatus)
                  : undefined,
              )
            }
            value={status ?? ""}
          >
            <option value="">All statuses</option>
            {(["backlog", "refining", "ready", "in_progress", "verify", "done"] as FeatureStatus[]).map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          Priority
          <select
            aria-label="Feature priority"
            onChange={(event) =>
              setPriority(
                event.target.value
                  ? (event.target.value as FeaturePriority)
                  : undefined,
              )
            }
            value={priority ?? ""}
          >
            <option value="">All priorities</option>
            {priorities.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          Epic
          <select
            aria-label="Feature grouping"
            onChange={(event) => {
              const value = event.target.value;
              const params = new URLSearchParams(location.search);
              if (value) params.set("epic", value);
              else params.delete("epic");
              navigate(
                {
                  pathname: location.pathname,
                  search: params.toString() ? `?${params.toString()}` : "",
                  hash: location.hash,
                },
                { replace: true },
              );
            }}
            value={epicFilter ?? ""}
          >
            <option value="">All Epics</option>
            {data?.epics.map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.title}
              </option>
            ))}
          </select>
        </label>
        {(search || status || priority || epicFilter) && (
          <button className="button ghost" onClick={clearFilters} type="button">
            Reset filters
          </button>
        )}
      </section>
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
      {createForm === "feature" && (
        <FeatureCreateForm
          actionPending={actionPending}
          epics={data?.epics ?? []}
          initialEpicId={epicFilter}
          onCancel={closeCreateForm}
          onSubmit={createFeature}
        />
      )}
      {createForm === "epic" && (
        <EpicCreateForm
          actionPending={actionPending}
          onCancel={closeCreateForm}
          onSubmit={createEpic}
        />
      )}
      {editingEpic && (
        <EpicEditForm
          actionPending={actionPending}
          epic={editingEpic}
          onCancel={() => setEditingEpic(null)}
          onSubmit={(payload) => updateEpic(editingEpic, payload)}
        />
      )}
      {loading ? (
        <LoadingPanel label="Loading planning data" />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void reload()} />
      ) : data ? (
        mode === "board" ? (
          <Board
            disabled={actionPending}
            epics={data.epics}
            features={data.features}
            onStatusChange={updateStatus}
          />
        ) : (
          <FeatureInventory
            data={data}
            disabled={actionPending}
            onEditEpic={setEditingEpic}
            onStatusChange={updateStatus}
          />
        )
      ) : null}
    </PageFrame>
  );
}
