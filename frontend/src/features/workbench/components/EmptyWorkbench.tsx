import { Link } from "react-router-dom";

export function EmptyWorkbench() {
  return (
    <section className="fnd05-empty">
      <span className="empty-orbit" aria-hidden="true">
        F
      </span>
      <span className="eyebrow accent">NO RUNS RECORDED YET</span>
      <h2>Start with a known Feature</h2>
      <p>
        Select a saved Context Package, then record progress without starting an
        agent or reading conversations automatically.
      </p>
      <div className="form-actions">
        <Link className="button primary" to="/workbench/runs/new">
          Record first run
        </Link>
        <Link className="button secondary" to="/projects">
          Explore Features
        </Link>
      </div>
    </section>
  );
}
