import { useCallback, useEffect, useRef, useState } from "react";
import { forgeApi, type Epic, type Feature, type FeatureDependency, type FeaturePriority, type FeatureStatus, type Project, type ProjectPlanningOverview, type Workspace } from "../../../api";
import { errorMessage } from "../utils";

export type PlanningData = {
  project: Project;
  overview: ProjectPlanningOverview;
  epics: Epic[];
  features: Feature[];
  dependencies: FeatureDependency[];
};

export type PlanningFilters = {
  search?: string;
  status?: FeatureStatus;
  priority?: FeaturePriority;
  epicId?: string;
};

export function usePlanningData(
  workspace: Workspace | null,
  projectId: string | undefined,
  filters: PlanningFilters = {},
) {
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(Boolean(workspace && projectId));
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspace || !projectId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const [project, overview, epics, features, dependencies] = await Promise.all([
        forgeApi.getProject(workspace.id, projectId, controller.signal),
        forgeApi.getPlanningOverview(workspace.id, projectId, controller.signal),
        forgeApi.listEpics(workspace.id, projectId, controller.signal),
        forgeApi.listFeatures(workspace.id, projectId, filters, controller.signal),
        forgeApi.listDependencies(workspace.id, projectId, controller.signal),
      ]);
      if (currentRequest !== requestId.current) return;
      setData({ project, overview, epics, features, dependencies });
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || currentRequest !== requestId.current) return;
      setError(errorMessage(cause, "Could not load planning data."));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [filters, projectId, workspace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
    };
  }, [reload]);

  return { data, loading, error, reload };
}
