import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";

type Theme = "dark" | "light";

type NavItem = {
  label: string;
  path: string;
  icon: string;
};

const navItems: NavItem[] = [
  { label: "Home", path: "/", icon: "⌂" },
  { label: "Projects", path: "/projects", icon: "□" },
  { label: "Workbench", path: "/workbench", icon: "◈" },
];

const commands = [
  { label: "Go to Home", path: "/", hint: "Workspace overview" },
  { label: "Go to Projects", path: "/projects", hint: "Local project inventory" },
  { label: "Open Workbench", path: "/workbench", hint: "Coming in a later milestone" },
];

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem("forge-theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("forge-theme", theme);
  }, [theme]);

  return [theme, () => setTheme((current) => (current === "dark" ? "light" : "dark"))];
}

function App() {
  const [theme, toggleTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteInvokerRef = useRef<HTMLButtonElement | null>(null);

  const openPalette = useCallback((button?: HTMLButtonElement) => {
    const activeElement = document.activeElement;
    paletteInvokerRef.current = button ?? (activeElement instanceof HTMLButtonElement ? activeElement : null);
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    requestAnimationFrame(() => paletteInvokerRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (paletteOpen) closePalette();
        else openPalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette, openPalette, paletteOpen]);

  return (
    <div className="app-shell">
      <Sidebar theme={theme} onToggleTheme={toggleTheme} />
      <main className="main-content">
        <Routes>
          <Route
            path="*"
            element={<WorkspaceRoutes onOpenPalette={openPalette} />}
          />
        </Routes>
      </main>
      {paletteOpen && <CommandPalette onClose={closePalette} />}
    </div>
  );
}

function Sidebar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <aside className="sidebar" aria-label="Forge navigation">
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true">F</div>
        <span className="brand-name">FORGE</span>
      </div>
      <div className="workspace-switcher" aria-label="Current workspace">
        <span>Local Workspace</span>
        <span className="workspace-caret" aria-hidden="true">⌄</span>
      </div>
      <nav className="primary-nav" aria-label="Primary">
        {navItems.map((item) => (
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            end={item.path === "/"}
            key={item.path}
            to={item.path}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-note">
        <span className="status-dot" aria-hidden="true" />
        <span>Local-first workspace</span>
      </div>
      <button className="theme-toggle" onClick={onToggleTheme} type="button">
        <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
        <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      </button>
    </aside>
  );
}

function WorkspaceRoutes({ onOpenPalette }: { onOpenPalette: (button: HTMLButtonElement) => void }) {
  return (
    <Routes>
      <Route element={<HomePage onOpenPalette={onOpenPalette} />} path="/" />
      <Route element={<ProjectsPage onOpenPalette={onOpenPalette} />} path="/projects" />
      <Route element={<WorkbenchPage onOpenPalette={onOpenPalette} />} path="/workbench" />
      <Route element={<HomePage onOpenPalette={onOpenPalette} />} path="*" />
    </Routes>
  );
}

function PageFrame({
  title,
  subtitle,
  onOpenPalette,
  children,
}: {
  title: string;
  subtitle: string;
  onOpenPalette: (button: HTMLButtonElement) => void;
  children: ReactNode;
}) {
  return (
    <div className="page-frame">
      <header className="workspace-header">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <button className="command-trigger" onClick={(event) => onOpenPalette(event.currentTarget)} type="button">
          <span className="command-key">⌘K</span>
          <span>Search or command</span>
        </button>
      </header>
      {children}
    </div>
  );
}

function HomePage({ onOpenPalette }: { onOpenPalette: (button: HTMLButtonElement) => void }) {
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Product intent connected to verified delivery."
      title="Workspace"
    >
      <section className="metric-grid" aria-label="Workspace summary">
        <Metric label="Projects" value="0" detail="No local projects connected" />
        <Metric label="Ready" value="—" detail="Nothing is ready yet" />
        <Metric label="In progress" value="—" detail="No active work" />
        <Metric label="Needs attention" value="0" detail="No blockers recorded" />
      </section>
      <div className="home-grid">
        <section className="content-column" aria-labelledby="projects-heading">
          <SectionHeading count="Empty" title="Projects" />
          <EmptyPanel
            actionLabel="View Projects"
            description="Connect a local repository when you are ready to make a project visible in Forge."
            eyebrow="NO PROJECTS YET"
            onAction="/projects"
            title="Your workspace is ready"
          />
          <SectionHeading count="Nothing queued" title="My work" />
          <div className="quiet-empty-row">
            <span className="mono-label">LOCAL</span>
            <span>No assigned work exists yet.</span>
          </div>
        </section>
        <aside className="content-column attention-column" aria-labelledby="attention-heading">
          <SectionHeading count="0" title="Needs attention" />
          <div className="empty-side-panel">
            <span className="empty-icon" aria-hidden="true">○</span>
            <h3>Nothing needs attention</h3>
            <p>Decisions, dependencies and evidence will appear here once your workspace has real data.</p>
          </div>
          <SectionHeading count="Empty" title="Recent" />
          <div className="empty-side-panel compact">
            <p>No activity has been observed yet.</p>
          </div>
        </aside>
      </div>
    </PageFrame>
  );
}

function ProjectsPage({ onOpenPalette }: { onOpenPalette: (button: HTMLButtonElement) => void }) {
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Local repositories stay yours. Forge observes them through the backend."
      title="Projects"
    >
      <section className="page-intro">
        <div>
          <span className="eyebrow">PROJECT INVENTORY</span>
          <h2>Start with an empty workspace</h2>
          <p>There are no connected projects yet. The local repository observer will arrive in a later milestone.</p>
        </div>
        <span className="status-chip neutral">0 connected</span>
      </section>
      <section className="projects-empty" aria-label="Empty projects state">
        <div className="empty-orbit" aria-hidden="true">+</div>
        <span className="eyebrow">NO LOCAL REPOSITORIES</span>
        <h2>Nothing connected yet</h2>
        <p>When project connection is implemented, this view will show verified local repository metadata here.</p>
        <button className="button secondary" disabled type="button">Connect project · FND-01</button>
      </section>
    </PageFrame>
  );
}

function WorkbenchPage({ onOpenPalette }: { onOpenPalette: (button: HTMLButtonElement) => void }) {
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="A deliberate place for human and agent work, without fake run history."
      title="Workbench"
    >
      <section className="workbench-placeholder" aria-label="Workbench placeholder">
        <div className="placeholder-grid" aria-hidden="true" />
        <span className="eyebrow">COMING LATER</span>
        <h2>The Workbench is not connected yet</h2>
        <p>Agent runs, handoffs and context packages are intentionally outside FND-00.</p>
        <span className="status-chip neutral">No runs available</span>
      </section>
    </PageFrame>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SectionHeading({ title, count }: { title: string; count: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      <span>{count}</span>
    </div>
  );
}

function EmptyPanel({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: string;
}) {
  return (
    <div className="empty-panel">
      <div>
        <span className="eyebrow accent">{eyebrow}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <NavLink className="button secondary" to={onAction}>{actionLabel} <span aria-hidden="true">→</span></NavLink>
    </div>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = commands.filter((command) =>
    `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => inputRef.current?.focus(), []);

  const safeActiveIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" && filtered.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % filtered.length);
      return;
    }
    if (event.key === "ArrowUp" && filtered.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + filtered.length) % filtered.length);
      return;
    }
    if (event.key === "Enter" && filtered[safeActiveIndex]) {
      event.preventDefault();
      go(filtered[safeActiveIndex].path);
      return;
    }
    if (event.key === "Tab") {
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("input, button") ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label="Command palette"
        aria-modal="true"
        className="command-palette"
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="palette-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-activedescendant={filtered[safeActiveIndex] ? `command-option-${safeActiveIndex}` : undefined}
            aria-autocomplete="list"
            aria-controls="command-options"
            aria-expanded="true"
            aria-label="Search commands"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search workspace"
            ref={inputRef}
            role="combobox"
            value={query}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-results" id="command-options" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <p className="palette-empty" role="status">No commands match “{query}”.</p>
          ) : (
            filtered.map((command, index) => (
              <button
                aria-selected={index === safeActiveIndex}
                className={`command-option${index === safeActiveIndex ? " current" : ""}`}
                id={`command-option-${index}`}
                key={command.path}
                onClick={() => go(command.path)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                type="button"
              >
                <span>{command.label}</span>
                <small>{command.hint}</small>
              </button>
            ))
          )}
        </div>
        <div className="palette-footer"><span>Navigate locally</span><span>↑↓ select · ↵ open</span></div>
      </section>
    </div>
  );
}

export default App;

