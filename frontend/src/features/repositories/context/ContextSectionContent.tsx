import { type ContextSectionId, type ContextRecord } from "./types";
import { asRecord, asRecords } from "./format";
import { ContextRecordFields } from "./ContextRecordFields";
import { ContextRecordList } from "./ContextRecordList";

export function ContextSectionContent({
  section,
  payload,
}: {
  section: ContextSectionId;
  payload: ContextRecord;
}) {
  const project = asRecord(payload.project);
  const feature = asRecord(payload.feature);
  const planning = asRecord(payload.planning);
  const readiness = payload.readiness ? asRecord(payload.readiness) : null;
  switch (section) {
    case "overview":
      return (
        <div className="context-overview-grid">
          <article className="context-record-card">
            <span className="mono-label">PROJECT DECLARATION</span>
            <ContextRecordFields record={project} />
          </article>
          <article className="context-record-card">
            <span className="mono-label">FEATURE DECLARATION</span>
            <ContextRecordFields record={feature} />
          </article>
        </div>
      );
    case "planning":
      return (
        <div className="context-record-stack">
          <ContextRecordList
            empty="No tasks are included."
            records={asRecords(planning.tasks)}
            title="Tasks"
          />
          <ContextRecordList
            empty="No acceptance criteria are included."
            records={asRecords(planning.acceptance_criteria)}
            title="Acceptance criteria"
          />
        </div>
      );
    case "dependencies":
      return (
        <ContextRecordList
          empty="No dependencies are included."
          records={asRecords(payload.dependencies)}
          title="Dependencies and direction"
        />
      );
    case "decisions":
      return (
        <ContextRecordList
          empty="No linked decisions are included."
          records={asRecords(payload.decisions)}
          title="Decisions and revisions"
        />
      );
    case "invariants":
      return (
        <ContextRecordList
          empty="No applicable invariants are included."
          records={asRecords(payload.invariants)}
          title="Invariants and acknowledgements"
        />
      );
    case "readiness":
      return readiness ? (
        <div className="context-record-stack">
          <article className="context-record-card">
            <span className="mono-label">SAVED PLANNING EVALUATION</span>
            <ContextRecordFields record={readiness} />
          </article>
          <p className="context-disclaimer">
            Readiness describes planning rules only. It is not implementation,
            test, CI or release verification.
          </p>
        </div>
      ) : (
        <p className="context-empty">
          No saved readiness evaluation is included.
        </p>
      );
    case "git":
      return (
        <div className="context-record-stack">
          <ContextRecordList
            empty="No Git observations are included. Planning-only context remains valid."
            records={asRecords(payload.git_observations)}
            title="Historical metadata observations"
          />
          <p className="context-disclaimer">
            Git observations are read-only metadata. An unavailable or
            historical observation is never presented as current verification.
          </p>
        </div>
      );
    case "provenance":
      return (
        <div className="context-provenance">
          <h4>What this snapshot represents</h4>
          <ul>
            <li>Planning fields are declared product context.</li>
            <li>
              Git fields are observed metadata and may be historical or
              unavailable.
            </li>
            <li>
              Preview does not create history; Generate &amp; save creates an
              immutable snapshot.
            </li>
            <li>
              Local paths, remote URLs, credentials, source content and
              untracked names are excluded.
            </li>
            <li>
              A clean observation does not prove tests passed or that a release
              is ready.
            </li>
          </ul>
        </div>
      );
  }
}
