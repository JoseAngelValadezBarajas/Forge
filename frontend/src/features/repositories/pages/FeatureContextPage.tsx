import { Link, useParams } from "react-router-dom";
import { type Workspace } from "../../../api";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { type PaletteOpener } from "./types";
import { ContextPackageSection } from "../context/ContextPackageSection";

export function FeatureContextPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const { projectId, featureId } = useParams<{
    projectId: string;
    featureId: string;
  }>();
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="An immutable, deterministic planning snapshot for this Feature."
      title="Context package"
    >
      <div className="planning-tabs">
        <Link
          className="detail-tab"
          to={`/projects/${projectId}/features/${featureId}`}
        >
          Feature detail
        </Link>
        <Link
          className="detail-tab active"
          to={`/projects/${projectId}/features/${featureId}/context`}
        >
          Context
        </Link>
      </div>
      {workspace && projectId && featureId ? (
        <ContextPackageSection
          featureId={featureId}
          projectId={projectId}
          workspace={workspace}
        />
      ) : (
        <div className="empty-panel">
          <h2>Select a workspace</h2>
          <p>Context packages are scoped to a Feature and Project.</p>
        </div>
      )}
    </PageFrame>
  );
}
