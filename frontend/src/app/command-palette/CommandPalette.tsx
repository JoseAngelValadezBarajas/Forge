import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type Command = {
  label: string;
  path: string;
  hint: string;
  action: "navigate" | "workspace";
  requiresProject?: boolean;
  requiresFeature?: boolean;
};

const commands: Command[] = [
  { label: "Go to Home", path: "/", hint: "Workspace overview", action: "navigate" },
  { label: "Go to Projects", path: "/projects", hint: "Project inventory", action: "navigate" },
  { label: "Create project", path: "/projects?create=1", hint: "Add a project", action: "navigate" },
  { label: "Create Feature", path: "", hint: "Create in the current project", action: "navigate", requiresProject: true },
  { label: "Create Epic", path: "", hint: "Create in the current project", action: "navigate", requiresProject: true },
  { label: "Open Feature Context", path: "", hint: "Preview deterministic context package", action: "navigate", requiresFeature: true },
  { label: "Go to Project Board", path: "/projects", hint: "Select a project board", action: "navigate" },
  { label: "Open Repositories", path: "/projects", hint: "Inspect optional local Git", action: "navigate", requiresProject: true },
  { label: "Open Features", path: "/projects", hint: "Select a project feature list", action: "navigate" },
  { label: "Open Decisions", path: "/projects", hint: "Select a project decision inventory", action: "navigate" },
  { label: "Open Invariants", path: "/projects", hint: "Select a project invariant inventory", action: "navigate" },
  { label: "Change workspace", path: "/", hint: "Use the workspace switcher", action: "workspace" },
  { label: "Open Workbench", path: "/workbench", hint: "Recorded work and handoffs", action: "navigate" },
  { label: "Open Agent Runs", path: "/workbench/runs", hint: "Reported run inventory", action: "navigate" },
  { label: "Record a Run", path: "/workbench/runs/new", hint: "Pin a saved Context Package", action: "navigate" },
  { label: "Open Handoffs", path: "/workbench/handoffs", hint: "Review reported handoffs", action: "navigate" },
  { label: "Open Delivery", path: "", hint: "Evidence, verification and release candidates", action: "navigate", requiresProject: true },
];

type CommandPaletteProps = {
  onClose: () => void;
  onChangeWorkspace: () => void;
};

export function CommandPalette({ onClose, onChangeWorkspace }: CommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];
  const featureMatch = location.pathname.match(/^\/projects\/[^/]+\/features\/([^/]+)/);
  const featureId = featureMatch?.[1];
  const availableCommands = commands
    .filter((command) => (!command.requiresProject || projectId) && (!command.requiresFeature || featureId))
    .map((command) => {
      if (command.label === "Create Feature" && projectId) return { ...command, path: `/projects/${projectId}/features?create=1` };
      if (command.label === "Create Epic" && projectId) return { ...command, path: `/projects/${projectId}/board?create=epic` };
      if (command.label === "Open Repositories" && projectId) return { ...command, path: `/projects/${projectId}/repositories` };
      if (command.label === "Open Feature Context" && projectId && featureId) return { ...command, path: `/projects/${projectId}/features/${featureId}/context` };
      if (command.label === "Open Delivery" && projectId) return { ...command, path: `/projects/${projectId}/delivery` };
      return command;
    });
  const filtered = availableCommands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase()));
  const safeIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

  useEffect(() => inputRef.current?.focus(), []);

  const go = (command: Command) => {
    navigate(command.path);
    if (command.action === "workspace") onChangeWorkspace();
    onClose();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "ArrowDown" && filtered.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % filtered.length); }
    else if (event.key === "ArrowUp" && filtered.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length); }
    else if (event.key === "Enter" && filtered[safeIndex]) { event.preventDefault(); go(filtered[safeIndex]); }
    else if (event.key === "Tab") { const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("input, button") ?? []); const first = focusable[0]; const last = focusable[focusable.length - 1]; if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  };

  return <div className="palette-backdrop" onMouseDown={onClose} role="presentation"><section aria-label="Command palette" aria-modal="true" className="command-palette" onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()} ref={dialogRef} role="dialog"><div className="palette-search"><span aria-hidden="true">⌕</span><input aria-activedescendant={filtered[safeIndex] ? `command-option-${safeIndex}` : undefined} aria-autocomplete="list" aria-controls="command-options" aria-expanded="true" aria-label="Search commands" onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="Search workspace" ref={inputRef} role="combobox" value={query} /><kbd>ESC</kbd></div><div className="palette-results" id="command-options" role="listbox" aria-label="Commands">{filtered.length === 0 ? <p className="palette-empty" role="status">No commands match “{query}”.</p> : filtered.map((command, index) => <button aria-selected={index === safeIndex} className={`command-option${index === safeIndex ? " current" : ""}`} id={`command-option-${index}`} key={command.label} onClick={() => go(command)} onMouseEnter={() => setActiveIndex(index)} role="option" type="button"><span>{command.label}</span><small>{command.hint}</small></button>)}</div><div className="palette-footer"><span>Navigate locally</span><span>↑↓ select · ↵ open</span></div></section></div>;
}
