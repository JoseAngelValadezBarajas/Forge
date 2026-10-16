import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { forgeApi, type Workspace } from "../../../api";
import { ProjectCard } from "../components/ProjectCard";
import { ProjectForm } from "../components/ProjectForm";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { type PaletteOpener } from "./types";
import { useProjects } from "../hooks/useProjects";

export function ProjectsPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [createOpen, setCreateOpen] = useState(
    () => new URLSearchParams(window.location.search).get("create") === "1",
  );
  const { projects, loading, error, reload } = useProjects(
    workspace?.id ?? null,
    search,
    status,
  );
  const statusLabel =
    status === "all"
      ? "All projects"
      : status === "active"
        ? "Active projects"
        : "Archived projects";
  const create = async (name: string, description: string) => {
    if (!workspace) throw new Error("Select a workspace first.");
    const project = await forgeApi.createProject(workspace.id, {
      name,
      description,
    });
    navigate(`/projects/${project.id}`);
  };
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Projects are durable records, independent from repositories and integrations."
      title="Projects"
    >
      <section className="page-intro">
        <div>
          <span className="eyebrow">PROJECT INVENTORY</span>
          <h2>{workspace?.name ?? "No workspace selected"}</h2>
          <p>
            Manage the intent and status of projects in the selected workspace.
          </p>
        </div>
        <button
          className="button primary"
          disabled={!workspace}
          onClick={() => setCreateOpen(true)}
          type="button"
        >
          + New project
        </button>
      </section>
      {createOpen && (
        <section className="form-panel">
          <div className="section-heading">
            <h2>Create project</h2>
            <button
              aria-label="Close create project"
              className="icon-button"
              onClick={() => setCreateOpen(false)}
              type="button"
            >
              x
            </button>
          </div>
          <ProjectForm
            onCancel={() => setCreateOpen(false)}
            onSubmit={create}
            submitLabel="Create project"
          />
        </section>
      )}
      <section className="list-toolbar" aria-label="Project filters">
        <label className="search-field">
          Search
          <input
            aria-label="Search projects"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or description"
            value={search}
          />
        </label>
        <label className="filter-field">
          View
          <select
            aria-label="Project status"
            onChange={(event) => setStatus(event.target.value as typeof status)}
            value={status}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </label>
      </section>
      <section aria-label={statusLabel} className="project-results">
        <div className="section-heading">
          <h2>{statusLabel}</h2>
          <span>{loading ? "Loading..." : `${projects.length} total`}</span>
        </div>
        {error ? (
          <ErrorPanel message={error} onRetry={() => void reload()} />
        ) : loading ? (
          <LoadingPanel label="Loading projects" />
        ) : projects.length ? (
          <div className="project-list">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="projects-empty">
            <div aria-hidden="true" className="empty-orbit">
              +
            </div>
            <span className="eyebrow">
              {status === "archived"
                ? "NO ARCHIVED PROJECTS"
                : "NO PROJECTS MATCH"}
            </span>
            <h2>
              {search ? "Nothing matches this search" : "Nothing here yet"}
            </h2>
            <p>
              {search
                ? "Try a different name or description."
                : "Create a project to make this workspace useful without pretending a repository exists."}
            </p>
            {!search && status !== "archived" && (
              <button
                className="button secondary"
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                Create first project
              </button>
            )}
          </div>
        )}
      </section>
    </PageFrame>
  );
}
