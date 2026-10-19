import { Link } from "react-router-dom";

export type BreadcrumbParent = {
  label: string;
  to: string;
};

export function ProjectBreadcrumbs({
  workspace,
  project,
  parent,
  current,
}: {
  workspace: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  parent?: BreadcrumbParent;
  current: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="project-breadcrumbs">
      <ol>
        <li>
          <Link to="/">{workspace?.name ?? "Workspace"}</Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          {project ? (
            <Link to={`/projects/${project.id}`}>{project.name}</Link>
          ) : (
            <span>Project</span>
          )}
        </li>
        {parent && (
          <>
            <li aria-hidden="true">/</li>
            <li>
              <Link to={parent.to}>{parent.label}</Link>
            </li>
          </>
        )}
        <li aria-hidden="true">/</li>
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}
