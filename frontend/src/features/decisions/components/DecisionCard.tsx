import { type Decision } from "../../../api";

export function DecisionCard({
  decision,
  onAccept,
  onEdit,
  onSupersede,
  onHistory,
}: {
  decision: Decision;
  onAccept: (decision: Decision) => void;
  onEdit: (decision: Decision) => void;
  onSupersede: (decision: Decision) => void;
  onHistory: (decision: Decision) => void;
}) {
  return (
    <article className="fnd-record-card">
      <div className="fnd-record-header">
        <div>
          <span className="mono-label">REVISION {decision.revision}</span>
          <h3>{decision.title}</h3>
        </div>
        <span className={`status-chip ${decision.status}`}>
          {decision.status}
        </span>
      </div>
      <p>{decision.decision}</p>
      <small>Why: {decision.rationale}</small>
      <div className="fnd-record-actions">
        {decision.status === "proposed" && (
          <button
            className="button secondary"
            onClick={() => onAccept(decision)}
            type="button"
          >
            Accept decision
          </button>
        )}
        {decision.status !== "superseded" && (
          <>
            <button
              className="button ghost"
              onClick={() => onEdit(decision)}
              type="button"
            >
              Edit
            </button>
            <button
              className="button ghost"
              onClick={() => onSupersede(decision)}
              type="button"
            >
              Supersede
            </button>
          </>
        )}
        <button
          className="button ghost"
          onClick={() => onHistory(decision)}
          type="button"
        >
          History
        </button>
      </div>
      {decision.superseded_by_id && (
        <p className="planning-disclaimer">
          Replaced by a successor decision. Historical context remains
          available.
        </p>
      )}
    </article>
  );
}
