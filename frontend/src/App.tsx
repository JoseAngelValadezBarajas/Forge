import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { forgeApi, type Workspace } from "./api";
import { Sidebar } from "./components";
import { HomePage, ProjectOverviewPage, ProjectsPage, WorkbenchPage } from "./pages";
import { FeatureDetailPage, FeaturesPage, ProjectBoardPage } from "./planning";
import { DecisionsPage, InvariantsPage } from "./fnd03";

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
  const selectWorkspace = useCallback((workspace: Workspace) => { workspaceState.select(workspace); navigate("/"); }, [navigate, workspaceState]);
  const createWorkspace = useCallback(async (name: string, description: string) => { await workspaceState.create(name, description); navigate("/"); }, [navigate, workspaceState]);
  const openPalette = useCallback((button?: HTMLButtonElement) => { const active = document.activeElement; paletteInvokerRef.current = button ?? (active instanceof HTMLButtonElement ? active : null); setPaletteOpen(true); }, []);
  const closePalette = useCallback(() => { setPaletteOpen(false); requestAnimationFrame(() => paletteInvokerRef.current?.focus()); }, []);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (paletteOpen) closePalette(); else openPalette(); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [closePalette, openPalette, paletteOpen]);
  if (workspaceState.loading) return <div className="app-loading" role="status">Loading Forge workspace…</div>;
  return <div className="app-shell"><Sidebar activeWorkspace={workspaceState.activeWorkspace} onCreateWorkspace={createWorkspace} onSelectWorkspace={selectWorkspace} onToggleTheme={toggleTheme} theme={theme} workspaceMenuRequest={workspaceMenuRequest} workspaces={workspaceState.workspaces} /><main className="main-content">{workspaceState.error && <div className="global-error" role="alert">{workspaceState.error}<button className="button secondary" onClick={() => void workspaceState.reload()} type="button">Retry</button></div>}<Routes><Route element={<WorkspaceRoutes activeWorkspace={workspaceState.activeWorkspace} onOpenPalette={openPalette} workspaceCount={workspaceState.workspaces.length} />} path="*" /></Routes></main>{paletteOpen && <CommandPalette onChangeWorkspace={() => setWorkspaceMenuRequest((value) => value + 1)} onClose={closePalette} />}</div>;
}

function WorkspaceRoutes({ activeWorkspace, workspaceCount, onOpenPalette }: { activeWorkspace: Workspace | null; workspaceCount: number; onOpenPalette: (button: HTMLButtonElement) => void }) {
  return <Routes><Route element={<HomePage onOpenPalette={onOpenPalette} workspace={activeWorkspace} workspaceCount={workspaceCount} />} path="/" /><Route element={<ProjectsPage onOpenPalette={onOpenPalette} workspace={activeWorkspace} />} path="/projects" /><Route element={<ProjectOverviewPage onOpenPalette={onOpenPalette} workspace={activeWorkspace} />} path="/projects/:projectId" /><Route element={<ProjectBoardPage onOpenPalette={onOpenPalette} workspace={activeWorkspace} />} path="/projects/:projectId/board" /><Route element={<FeaturesPage onOpenPalette={onOpenPalette} workspace={activeWorkspace} />} path="/projects/:projectId/features" /><Route element={<FeatureDetailPage onOpenPalette={onOpenPalette} workspace={activeWorkspace} />} path="/projects/:projectId/features/:featureId" /><Route element={<DecisionsPage onOpenPalette={onOpenPalette} workspace={activeWorkspace} />} path="/projects/:projectId/decisions" /><Route element={<InvariantsPage onOpenPalette={onOpenPalette} workspace={activeWorkspace} />} path="/projects/:projectId/invariants" /><Route element={<WorkbenchPage onOpenPalette={onOpenPalette} />} path="/workbench" /><Route element={<HomePage onOpenPalette={onOpenPalette} workspace={activeWorkspace} workspaceCount={workspaceCount} />} path="*" /></Routes>;
}

const commands = [
  { label: "Go to Home", path: "/", hint: "Workspace overview", action: "navigate" },
  { label: "Go to Projects", path: "/projects", hint: "Project inventory", action: "navigate" },
  { label: "Create project", path: "/projects?create=1", hint: "Add a project", action: "navigate" },
  { label: "Create Feature", path: "", hint: "Create in the current project", action: "navigate", requiresProject: true },
  { label: "Create Epic", path: "", hint: "Create in the current project", action: "navigate", requiresProject: true },
  { label: "Go to Project Board", path: "/projects", hint: "Select a project board", action: "navigate" },
  { label: "Open Features", path: "/projects", hint: "Select a project feature list", action: "navigate" },
  { label: "Open Decisions", path: "/projects", hint: "Select a project decision inventory", action: "navigate" },
  { label: "Open Invariants", path: "/projects", hint: "Select a project invariant inventory", action: "navigate" },
  { label: "Change workspace", path: "/", hint: "Use the workspace switcher", action: "workspace" },
  { label: "Open Workbench", path: "/workbench", hint: "Coming in a later milestone", action: "navigate" },
];

function CommandPalette({ onClose, onChangeWorkspace }: { onClose: () => void; onChangeWorkspace: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];
  const availableCommands = commands
    .filter((command) => !command.requiresProject || projectId)
    .map((command) => {
      if (command.label === "Create Feature" && projectId) return { ...command, path: `/projects/${projectId}/features?create=1` };
      if (command.label === "Create Epic" && projectId) return { ...command, path: `/projects/${projectId}/board?create=epic` };
      return command;
    });
  const filtered = availableCommands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase()));
  const safeIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));
  useEffect(() => inputRef.current?.focus(), []);
  const go = (command: (typeof commands)[number]) => { navigate(command.path); if (command.action === "workspace") onChangeWorkspace(); onClose(); };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "ArrowDown" && filtered.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % filtered.length); }
    else if (event.key === "ArrowUp" && filtered.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length); }
    else if (event.key === "Enter" && filtered[safeIndex]) { event.preventDefault(); go(filtered[safeIndex]); }
    else if (event.key === "Tab") { const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("input, button") ?? []); const first = focusable[0]; const last = focusable[focusable.length - 1]; if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  };
  return <div className="palette-backdrop" onMouseDown={onClose} role="presentation"><section aria-label="Command palette" aria-modal="true" className="command-palette" onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()} ref={dialogRef} role="dialog"><div className="palette-search"><span aria-hidden="true">⌕</span><input aria-activedescendant={filtered[safeIndex] ? `command-option-${safeIndex}` : undefined} aria-autocomplete="list" aria-controls="command-options" aria-expanded="true" aria-label="Search commands" onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="Search workspace" ref={inputRef} role="combobox" value={query} /><kbd>ESC</kbd></div><div className="palette-results" id="command-options" role="listbox" aria-label="Commands">{filtered.length === 0 ? <p className="palette-empty" role="status">No commands match “{query}”.</p> : filtered.map((command, index) => <button aria-selected={index === safeIndex} className={`command-option${index === safeIndex ? " current" : ""}`} id={`command-option-${index}`} key={command.label} onClick={() => go(command)} onMouseEnter={() => setActiveIndex(index)} role="option" type="button"><span>{command.label}</span><small>{command.hint}</small></button>)}</div><div className="palette-footer"><span>Navigate locally</span><span>↑↓ select · ↵ open</span></div></section></div>;
}

export default App;
