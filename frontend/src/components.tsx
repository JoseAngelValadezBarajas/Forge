import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import type { Project, Workspace } from "./api";

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  onSelect,
  onCreate,
  openRequest = 0,
}: {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelect: (workspace: Workspace) => void;
  onCreate: (name: string, description: string) => Promise<void>;
  openRequest?: number;
}) {
  const [open, setOpen] = useState(openRequest > 0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Workspace name is required.");
      return;
    }
    try {
      await onCreate(name, description);
      setName("");
      setDescription("");
      setCreating(false);
      setError(null);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create workspace.");
    }
  };

  return (
    <div className="workspace-switcher-wrap" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="workspace-switcher"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>{activeWorkspace?.name ?? "No workspace selected"}</span>
        <span className="workspace-caret" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="workspace-menu" role="menu">
          <span className="eyebrow">WORKSPACES</span>
          {workspaces.map((workspace) => (
            <button
              className={`workspace-option${workspace.id === activeWorkspace?.id ? " selected" : ""}`}
              key={workspace.id}
              onClick={() => {
                onSelect(workspace);
                setOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              <span>{workspace.name}</span>
              {workspace.id === activeWorkspace?.id && <span aria-label="Selected">●</span>}
            </button>
          ))}
          {creating ? (
            <form className="workspace-create-form" onSubmit={submit}>
              <label>
                Name
                <input autoFocus onChange={(event) => setName(event.target.value)} value={name} />
              </label>
              <label>
                Description
                <input onChange={(event) => setDescription(event.target.value)} value={description} />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="form-actions">
                <button className="button secondary" onClick={() => setCreating(false)} type="button">Cancel</button>
                <button className="button primary" type="submit">Create</button>
              </div>
            </form>
          ) : (
            <button className="workspace-create" onClick={() => setCreating(true)} role="menuitem" type="button">
              <span aria-hidden="true">+</span> Create workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  theme,
  onToggleTheme,
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceMenuRequest,
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: (name: string, description: string) => Promise<void>;
  workspaceMenuRequest?: number;
}) {
  const navItems = [
    { label: "Home", path: "/", icon: "⌂" },
    { label: "Projects", path: "/projects", icon: "□" },
    { label: "Workbench", path: "/workbench", icon: "◈" },
  ];
  return (
    <aside className="sidebar" aria-label="Forge navigation">
      <div className="brand-row"><div className="brand-mark" aria-hidden="true">F</div><span className="brand-name">FORGE</span></div>
      <WorkspaceSwitcher
        activeWorkspace={activeWorkspace}
        key={workspaceMenuRequest}
        onCreate={onCreateWorkspace}
        onSelect={onSelectWorkspace}
        openRequest={workspaceMenuRequest}
        workspaces={workspaces}
      />
      <nav className="primary-nav" aria-label="Primary">
        {navItems.map((item) => <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} end={item.path === "/"} key={item.path} to={item.path}><span aria-hidden="true" className="nav-icon">{item.icon}</span><span>{item.label}</span></NavLink>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-note"><span className="status-dot" aria-hidden="true" /><span>Local-first workspace</span></div>
      <button className="theme-toggle" onClick={onToggleTheme} type="button"><span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span><span>{theme === "dark" ? "Light mode" : "Dark mode"}</span></button>
    </aside>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();
  return (
    <button className="project-card" onClick={() => navigate(`/projects/${project.id}`)} type="button">
      <div className="project-card-top"><div><h3>{project.name}</h3><p>{project.description || "No description yet."}</p></div><span className={`status-chip ${project.status}`}>{project.status}</span></div>
      <div className="project-card-meta"><span>Updated {formatDate(project.updated_at)}</span><span aria-hidden="true">→</span></div>
    </button>
  );
}

export function ProjectForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; description: string };
  submitLabel: string;
  onSubmit: (name: string, description: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError("Project name is required."); return; }
    setSaving(true);
    try { await onSubmit(name, description); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save project."); }
    finally { setSaving(false); }
  };
  return <form className="project-form" onSubmit={submit}>
    <label>Name<input aria-label="Project name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></label>
    <label>Description<span className="field-hint">Optional</span><textarea aria-label="Project description" maxLength={2000} onChange={(event) => setDescription(event.target.value)} rows={4} value={description} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions">{onCancel && <button className="button secondary" onClick={onCancel} type="button">Cancel</button>}<button className="button primary" disabled={saving} type="submit">{saving ? "Saving…" : submitLabel}</button></div>
  </form>;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
