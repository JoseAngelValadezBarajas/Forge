import { Link } from "react-router-dom";
import { type Workspace } from "../../../api";
import { RepositoryInventory } from "./RepositoryInventory";

export function ProjectRepositorySection({
  workspace,
  projectId,
}: {
  workspace: Workspace;
  projectId: string;
}) {
  return (
    <section className="detail-section repository-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow accent">OPTIONAL LOCAL GIT</span>
          <h2>Repositories</h2>
        </div>
        <Link
          className="button ghost"
          to={`/projects/${projectId}/repositories`}
        >
          Open inventory
        </Link>
      </div>
      <p className="planning-disclaimer">
        Repositories are optional. Forge reads local Git metadata only; no
        source content, remotes or credentials are collected.
      </p>
      <RepositoryInventory
        compact
        projectId={projectId}
        workspace={workspace}
      />
    </section>
  );
}
