import { NavLink } from "react-router-dom";
import { type Workspace } from "../../../api";
import { ProjectCard } from "../components/ProjectCard";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { MetricCard } from "../../../shared/ui/MetricCard";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { formatDate } from "../../../shared/utils/formatDate";
import { type PaletteOpener } from "./types";
import { useProjects } from "../hooks/useProjects";
import { SectionHeading } from "../components/SectionHeading";

export function HomePage({
  workspace,
  workspaceCount,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  workspaceCount: number;
  onOpenPalette: PaletteOpener;
}) {
  const { projects, loading, error, reload } = useProjects(
    workspace?.id ?? null,
  );
  const active = projects.filter((project) => project.status === "active");
  const archived = projects.filter((project) => project.status === "archived");
  const recent = [...projects]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 3);
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="A local container for projects, planning context and decisions."
      title="Workspace"
    >
      <section aria-label="Workspace summary" className="metric-grid">
        <MetricCard
          detail="Available locally"
          label="Workspaces"
          value={String(workspaceCount)}
        />
        <MetricCard
          detail="Not archived"
          label="Active projects"
          value={String(active.length)}
        />
        <MetricCard
          detail="Kept for history"
          label="Archived"
          value={String(archived.length)}
        />
        <MetricCard
          detail="Most recently changed"
          label="Recent projects"
          value={String(recent.length)}
        />
      </section>
      <div className="home-grid">
        <section className="content-column">
          <SectionHeading
            count={loading ? "..." : String(active.length)}
            title="Projects"
          />
          {error ? (
            <ErrorPanel message={error} onRetry={() => void reload()} />
          ) : active.length ? (
            <div className="project-list">
              {active.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <EmptyPanel
              actionLabel="Create project"
              description="Give this workspace a clear starting point. Projects do not require a repository yet."
              eyebrow="NO PROJECTS YET"
              onAction="/projects?create=1"
              title="Your workspace is ready"
            />
          )}
          <SectionHeading count="Local" title="Recent" />
          {recent.length ? (
            <div className="recent-list">
              {recent.map((project) => (
                <NavLink
                  className="quiet-empty-row recent-row"
                  key={project.id}
                  to={`/projects/${project.id}`}
                >
                  <span className="mono-label">
                    {project.status.toUpperCase()}
                  </span>
                  <span>{project.name}</span>
                  <span>{formatDate(project.updated_at)}</span>
                </NavLink>
              ))}
            </div>
          ) : (
            <div className="quiet-empty-row">
              <span className="mono-label">LOCAL</span>
              <span>No project activity exists yet.</span>
            </div>
          )}
        </section>
        <aside className="content-column attention-column">
          <SectionHeading count="None" title="Signals" />
          <div className="empty-side-panel">
            <span className="empty-icon" aria-hidden="true">
              o
            </span>
            <h3>No signals yet</h3>
            <p>
              Repositories, CI and delivery evidence are intentionally not
              connected yet.
            </p>
          </div>
          <SectionHeading count="Planning" title="Scope" />
          <div className="empty-side-panel compact">
            <p>
              Planning records are available. Integrations will appear only when
              implemented.
            </p>
          </div>
        </aside>
      </div>
    </PageFrame>
  );
}

export function EmptyPanel({
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
      <NavLink className="button secondary" to={onAction}>
        {actionLabel} <span aria-hidden="true">-&gt;</span>
      </NavLink>
    </div>
  );
}
