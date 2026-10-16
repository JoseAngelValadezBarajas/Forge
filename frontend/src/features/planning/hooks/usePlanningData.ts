import { useCallback, useEffect, useRef, useState } from "react";
import { forgeApi, type Epic, type Feature, type FeatureDependency, type FeaturePriority, type ProjectPlanningOverview, type Workspace } from "../../../api";
import { errorMessage } from "../utils";

export type PlanningData = {
  overview: ProjectPlanningOverview;
  epics: Epic[];
  features: Feature[];
  dependencies: FeatureDependency[];
};

export function usePlanningData(
  workspace: Workspace | null,
  projectId: string | undefined,
  search = "",
  priority?: FeaturePriority,
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
      const [overview, epics, features, dependencies] = await Promise.all([
        forgeApi.getPlanningOverview(workspace.id, projectId, controller.signal),
        forgeApi.listEpics(workspace.id, projectId, controller.signal),
        forgeApi.listFeatures(workspace.id, projectId, { search, priority }, controller.signal),
        forgeApi.listDependencies(workspace.id, projectId, controller.signal),
      ]);
      if (currentRequest !== requestId.current) return;
      setData({ overview, epics, features, dependencies });
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || currentRequest !== requestId.current) return;
      setError(errorMessage(cause, "Could not load planning data."));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [priority, projectId, search, workspace]);

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
