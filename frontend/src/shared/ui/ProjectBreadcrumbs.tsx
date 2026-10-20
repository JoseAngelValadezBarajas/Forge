import { Breadcrumbs } from "./Breadcrumbs";

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
  return <Breadcrumbs items={[
    { label: workspace?.name ?? "Workspace", to: "/" },
    { label: project?.name ?? "Project", to: project ? `/projects/${project.id}` : undefined },
    ...(parent ? [{ label: parent.label, to: parent.to }] : []),
    { current: true, label: current },
  ]} />;
}
