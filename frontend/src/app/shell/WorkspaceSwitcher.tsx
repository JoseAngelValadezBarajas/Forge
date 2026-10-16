import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import type { Workspace } from "../../api";

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
