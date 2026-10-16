import { Link } from "react-router-dom";
import type { EvidenceRecord } from "../../../api";
import { formatDate } from "../../../shared/utils/formatDate";
import { Provenance } from "../components/Provenance";

export function EvidenceList({
  items,
  projectId,
}: {
  items: EvidenceRecord[];
  projectId: string;
}) {
  return (
    <div className="fnd06-list">
      {items.map((item) => (
        <Link
          className="fnd06-row fnd06-link-row"
          key={item.id}
          to={`/projects/${projectId}/delivery/evidence/${item.id}`}
        >
          <div>
            <span className="mono-label">
              {item.evidence_type.replaceAll("_", " ")} · {item.source_kind}
            </span>
            <h3>{item.title}</h3>
            <p>
              {item.feature_id ? "Feature linked" : "Project level"} ·{" "}
              {item.status} · {formatDate(item.recorded_at)}
            </p>
          </div>
          <Provenance value={item.provenance} />
        </Link>
      ))}
    </div>
  );
}
