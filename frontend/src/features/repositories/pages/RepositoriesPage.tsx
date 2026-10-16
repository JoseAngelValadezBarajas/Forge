import { Link, useParams } from "react-router-dom";
import { type Workspace } from "../../../api";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { type PaletteOpener } from "./types";
import { RepositoryInventory } from "../components/RepositoryInventory";

export function RepositoriesPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Optional local Git connections. Forge observes metadata and never changes the repository."
      title="Repositories"
    >
      <div className="planning-tabs">
        <Link className="detail-tab" to={`/projects/${projectId}`}>
          Overview
        </Link>
        <Link
          className="detail-tab active"
          to={`/projects/${projectId}/repositories`}
        >
          Repositories
        </Link>
        <Link className="detail-tab" to={`/projects/${projectId}/board`}>
          Board
        </Link>
      </div>
      {workspace && projectId ? (
        <RepositoryInventory
          compact={false}
          projectId={projectId}
          workspace={workspace}
        />
      ) : (
        <div className="empty-panel">
          <h2>Select a workspace</h2>
          <p>Create or select a workspace before connecting a repository.</p>
        </div>
      )}
    </PageFrame>
  );
}
