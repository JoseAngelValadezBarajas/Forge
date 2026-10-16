import { useCallback, useEffect, useRef, useState } from "react";
import { forgeApi, type Project } from "../../../api";

export function useProjects(
  workspaceId: string | null,
  search = "",
  status: "active" | "archived" | "all" = "all",
) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const id = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!workspaceId) {
      setProjects([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await forgeApi.listProjects(
        workspaceId,
        search,
        status,
        controller.signal,
      );
      if (id !== requestId.current) return;
      setProjects(result);
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted || id !== requestId.current) return;
      setError(
        cause instanceof Error ? cause.message : "Could not load projects.",
      );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [search, status, workspaceId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
    };
  }, [reload]);
  return { projects, loading, error, reload };
}
