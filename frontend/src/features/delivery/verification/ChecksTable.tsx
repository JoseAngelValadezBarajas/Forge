import type { GateEvaluation } from "../../../api";

export function ChecksTable({ gate }: { gate: GateEvaluation }) {
  return (
    <div className="fnd06-check-list">
      {gate.checks.map((check) => (
        <article className="fnd06-check" key={check.rule_id}>
          <div>
            <span className="mono-label">
              {check.rule_id} · v{check.version}
            </span>
            <h3>{check.explanation}</h3>
            <p>{check.limitations.join(" ")}</p>
            {check.blockers.map((blocker) => (
              <p className="form-error" key={blocker}>
                {blocker}
              </p>
            ))}
          </div>
          <span className={`status-chip ${check.status.toLowerCase()}`}>
            {check.status}
          </span>
        </article>
      ))}
    </div>
  );
}
