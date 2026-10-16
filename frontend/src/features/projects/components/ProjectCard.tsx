import { useNavigate } from "react-router-dom";

import type { Project } from "../../../api";
import { formatDate } from "../../../shared/utils/formatDate";

export function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();
  return (
    <button className="project-card" onClick={() => navigate(`/projects/${project.id}`)} type="button">
      <div className="project-card-top"><div><h3>{project.name}</h3><p>{project.description || "No description yet."}</p></div><span className={`status-chip ${project.status}`}>{project.status}</span></div>
      <div className="project-card-meta"><span>Updated {formatDate(project.updated_at)}</span><span aria-hidden="true">→</span></div>
    </button>
  );
}
