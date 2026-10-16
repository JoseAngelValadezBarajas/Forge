import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { forgeApi, type Workspace } from "../api";
import { Sidebar } from "./shell/Sidebar";
import { AppRouter } from "./router";
import { CommandPalette } from "./command-palette/CommandPalette";

type Theme = "dark" | "light";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => window.localStorage.getItem("forge-theme") === "light" ? "light" : "dark");
  useEffect(() => { document.documentElement.dataset.theme = theme; window.localStorage.setItem("forge-theme", theme); }, [theme]);
  return [theme, () => setTheme((current) => current === "dark" ? "light" : "dark")];
}

function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => window.localStorage.getItem("forge-active-workspace"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => {
    setLoading(true);
    try {
      const items = await forgeApi.listWorkspaces();
      setWorkspaces(items);
      const saved = window.localStorage.getItem("forge-active-workspace");
      const next = items.find((item) => item.id === saved)?.id ?? items[0]?.id ?? null;
      setActiveWorkspaceId(next);
      if (next) window.localStorage.setItem("forge-active-workspace", next);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load workspaces."); }
    finally { setLoading(false); }
  };
  // Load persisted workspace selection from the backend once on mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, []);
  const select = (workspace: Workspace) => { setActiveWorkspaceId(workspace.id); window.localStorage.setItem("forge-active-workspace", workspace.id); };
  const create = async (name: string, description: string) => { const workspace = await forgeApi.createWorkspace({ name, description }); setWorkspaces((current) => [...current, workspace].sort((a, b) => a.name.localeCompare(b.name))); select(workspace); };
  return { workspaces, activeWorkspace: workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null, loading, error, reload, select, create };
}

function App() {
  const [theme, toggleTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [workspaceMenuRequest, setWorkspaceMenuRequest] = useState(0);
  const paletteInvokerRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const workspaceState = useWorkspaces();
  const selectWorkspace = useCallback((workspace: Workspace) => { navigate("/"); workspaceState.select(workspace); }, [navigate, workspaceState]);
  const createWorkspace = useCallback(async (name: string, description: string) => { navigate("/"); await workspaceState.create(name, description); }, [navigate, workspaceState]);
  const openPalette = useCallback((button?: HTMLButtonElement) => { const active = document.activeElement; paletteInvokerRef.current = button ?? (active instanceof HTMLButtonElement ? active : null); setPaletteOpen(true); }, []);
  const closePalette = useCallback(() => { setPaletteOpen(false); requestAnimationFrame(() => paletteInvokerRef.current?.focus()); }, []);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (paletteOpen) closePalette(); else openPalette(); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [closePalette, openPalette, paletteOpen]);
  if (workspaceState.loading) return <div className="app-loading" role="status">Loading Forge workspace…</div>;
  return <div className="app-shell">
    <Sidebar activeWorkspace={workspaceState.activeWorkspace} onCreateWorkspace={createWorkspace} onSelectWorkspace={selectWorkspace} onToggleTheme={toggleTheme} theme={theme} workspaceMenuRequest={workspaceMenuRequest} workspaces={workspaceState.workspaces} />
    <main className="main-content">
      {workspaceState.error && <div className="global-error" role="alert">{workspaceState.error}<button className="button secondary" onClick={() => void workspaceState.reload()} type="button">Retry</button></div>}
      <AppRouter activeWorkspace={workspaceState.activeWorkspace} onOpenPalette={openPalette} workspaceCount={workspaceState.workspaces.length} />
    </main>
    {paletteOpen && <CommandPalette onChangeWorkspace={() => setWorkspaceMenuRequest((value) => value + 1)} onClose={closePalette} />}
  </div>;
}

export default App;
