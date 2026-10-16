import { NavLink } from "react-router-dom";

import type { Workspace } from "../../api";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

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
