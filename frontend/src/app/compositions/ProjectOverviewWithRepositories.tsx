import { useParams } from "react-router-dom";
import { type Workspace } from "../../api";
import { ProjectOverviewPage } from "../../features/projects";
import { ProjectRepositorySection } from "../../features/repositories";

export type PaletteOpener = (button: HTMLButtonElement) => void;

export function ProjectOverviewWithRepositories({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <>
      <ProjectOverviewPage
        onOpenPalette={onOpenPalette}
        workspace={workspace}
      />
      {workspace && projectId && (
        <div className="page-frame project-repository-append">
          <ProjectRepositorySection
            projectId={projectId}
            workspace={workspace}
          />
        </div>
      )}
    </>
  );
}
