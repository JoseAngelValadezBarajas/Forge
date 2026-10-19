import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  forgeApi,
  ApiError,
  type ApplicableInvariant,
  type Decision,
  type Feature,
  type ReadinessBlocker,
  type ReadinessEvaluation,
  type Workspace,
} from "../../../api";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { message, stamp } from "../utils";

function BlockerAction({
  blocker,
  featureId,
  projectId,
  ruleId,
}: {
  blocker: ReadinessBlocker;
  featureId: string;
  projectId: string;
  ruleId: string;
}) {
  const reference = blocker.references[0];
  if (ruleId === "R01") {
    return <a href="#feature-definition">Edit definition</a>;
  }
  if (ruleId === "R02") {
    return <a href="#acceptance-criteria">Add criteria</a>;
  }
  if (ruleId === "R03") {
    return reference?.kind === "feature" && reference.id !== featureId ? (
      <Link to={`/projects/${projectId}/features/${encodeURIComponent(reference.id)}`}>
        Open blocking feature
      </Link>
    ) : (
      <a href="#dependencies">Review dependencies</a>
    );
  }
  if (ruleId === "R04") {
    return <Link to={`/projects/${projectId}/decisions`}>Open Decisions</Link>;
  }
  if (ruleId === "R05") {
    return <a href="#readiness-invariants">Review invariants</a>;
  }
  if (ruleId === "R06") {
    return <Link to={`/projects/${projectId}`}>Open Project Overview</Link>;
  }
  return null;
}

export function ReadinessPanel({
  workspace,
  projectId,
  feature,
  refreshKey,
  archived = false,
  onPreviewChange,
}: {
  workspace: Workspace;
  projectId: string;
  feature: Feature;
  refreshKey: string | number;
  archived?: boolean;
  onPreviewChange?: (evaluation: ReadinessEvaluation | null) => void;
}) {
  const [preview, setPreview] = useState<ReadinessEvaluation | null>(null);
  const [history, setHistory] = useState<ReadinessEvaluation[]>([]);
  const [invariants, setInvariants] = useState<ApplicableInvariant[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [allDecisions, setAllDecisions] = useState<Decision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<
    "preview" | "save" | "link" | string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const publishPreview = useCallback(
    (next: ReadinessEvaluation | null) => {
      setPreview(next);
      onPreviewChange?.(next);
    },
    [onPreviewChange],
  );
  const load = useCallback(async () => {
    void refreshKey;
    actionController.current?.abort();
    setPending(null);
    const controller = new AbortController();
    loadController.current?.abort();
    loadController.current = controller;
    setLoading(true);
    try {
      const [
        nextPreview,
        nextHistory,
        nextInvariants,
        nextDecisions,
        nextAllDecisions,
      ] = await Promise.all([
        forgeApi.previewReadiness(
          workspace.id,
          projectId,
          feature.id,
          controller.signal,
        ),
        forgeApi.listReadinessEvaluations(
          workspace.id,
          projectId,
          feature.id,
          controller.signal,
        ),
        forgeApi.listFeatureInvariants(
          workspace.id,
          projectId,
          feature.id,
          controller.signal,
        ),
        forgeApi.listFeatureDecisions(
          workspace.id,
          projectId,
          feature.id,
          controller.signal,
        ),
        forgeApi.listDecisions(workspace.id, projectId, controller.signal),
      ]);
      publishPreview(
        nextPreview && Array.isArray(nextPreview.results) ? nextPreview : null,
      );
      setHistory(
        Array.isArray(nextHistory)
          ? nextHistory.filter((item) =>
              Boolean(item?.evaluation_id && item.evaluated_at),
            )
          : [],
      );
      setInvariants(Array.isArray(nextInvariants) ? nextInvariants : []);
      setDecisions(Array.isArray(nextDecisions) ? nextDecisions : []);
      setAllDecisions(Array.isArray(nextAllDecisions) ? nextAllDecisions : []);
      setError(null);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(message(cause, "Could not evaluate readiness."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [feature.id, projectId, publishPreview, refreshKey, workspace.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      loadController.current?.abort();
      actionController.current?.abort();
    };
  }, [load]);
  const run = async (kind: "preview" | "save") => {
    if (archived && kind === "save") return;
    setPending(kind);
    setError(null);
    actionController.current?.abort();
    const controller = new AbortController();
    actionController.current = controller;
    try {
      const next =
        kind === "preview"
          ? await forgeApi.previewReadiness(
              workspace.id,
              projectId,
              feature.id,
              controller.signal,
            )
          : await forgeApi.saveReadiness(
              workspace.id,
              projectId,
              feature.id,
              controller.signal,
            );
      if (controller.signal.aborted) return;
      publishPreview(next);
      if (kind === "save") setHistory((current) => [next, ...current]);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(message(cause, "Could not evaluate readiness."));
    } finally {
      if (!controller.signal.aborted) setPending(null);
    }
  };
  const link = async () => {
    if (!selectedDecision) return;
    setPending("link");
    try {
      await forgeApi.linkDecision(
        workspace.id,
        projectId,
        selectedDecision,
        feature.id,
      );
      setSelectedDecision("");
      await load();
    } catch (cause) {
      setError(message(cause, "Could not link decision."));
    } finally {
      setPending(null);
    }
  };
  const acknowledge = async (invariantId: string, expectedRevision: number) => {
    setPending(invariantId);
    try {
      await forgeApi.acknowledgeInvariant(
        workspace.id,
        projectId,
        feature.id,
        invariantId,
        expectedRevision,
      );
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        await load();
        setError(
          "This invariant changed before review. The current revision was loaded; review it and try again.",
        );
      } else setError(message(cause, "Could not acknowledge invariant."));
    } finally {
      setPending(null);
    }
  };
  const unlinked = useMemo(
    () =>
      allDecisions.filter(
        (item) =>
          !decisions.some(
            (linked) => linked.id === item.id && item.status !== "superseded",
          ),
      ),
    [allDecisions, decisions],
  );
  if (loading)
    return (
      <section className="detail-section readiness-panel">
        <LoadingPanel label="Loading readiness" />
      </section>
    );
  return (
    <section
      id="readiness"
      className="detail-section readiness-panel"
      aria-label="Planning readiness"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow accent">PLANNING READINESS</span>
          <h2>Readiness</h2>
        </div>
        <span
          className={`readiness-outcome ${preview?.outcome === "READY_TO_START" ? "ready" : "blocked"}`}
        >
          {preview?.outcome === "READY_TO_START"
            ? "READY TO START"
            : "NOT READY"}
        </span>
      </div>
      <p className="planning-disclaimer">
        Manual Feature Status is separate. READY TO START means planning rules
        pass; no implementation or delivery verification was performed.
      </p>
      {archived && (
        <p className="read-only-notice" role="status">
          Archived project · read-only. You can review readiness and history, but
          cannot change planning data or save a new evaluation.
        </p>
      )}
      {error && (
        <p className="status-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <>
          <div className="readiness-current-note">
            <span className="mono-label">CURRENT PREVIEW</span>
            <span>
              Recomputed from the current planning context. Preview does not
              create history.
            </span>
          </div>
          <div className="readiness-progress">
            <div>
              <span>
                {preview.passed_checks.length} / {preview.results.length} rules
                passed
              </span>
              <span>
                {preview.stale ? "STALE" : preview.rule_set_version}
              </span>
            </div>
            <div className="readiness-track">
              <span
                style={{
                  width: `${(preview.passed_checks.length / Math.max(preview.results.length, 1)) * 100}%`,
                }}
              />
            </div>
          </div>
          <div className="readiness-rules">
            {preview.results.map((result) => (
              <article
                className={`readiness-rule ${result.result}`}
                key={result.rule_id}
              >
                <div>
                  <strong>
                    {result.result === "passed" ? "PASS" : "BLOCKED"} ·{" "}
                    {result.rule_id}
                  </strong>
                  <p>{result.explanation}</p>
                </div>
                {result.blockers.map((blocker, blockerIndex) => (
                  <div
                    className="readiness-blocker"
                    key={`${result.rule_id}-${blocker.code}-${blockerIndex}`}
                  >
                    <span>{blocker.message}</span>
                    <BlockerAction
                      blocker={blocker}
                      featureId={feature.id}
                      projectId={projectId}
                      ruleId={result.rule_id}
                    />
                  </div>
                ))}
              </article>
            ))}
          </div>
          <div className="detail-actions">
            <button
              className="button secondary"
              disabled={pending !== null}
              onClick={() => void run("preview")}
              type="button"
            >
              {pending === "preview" ? "Evaluating..." : "Preview current"}
            </button>
            {!archived && (
              <button
                className="button primary"
                disabled={pending !== null}
                onClick={() => void run("save")}
                type="button"
              >
                {pending === "save" ? "Saving..." : "Evaluate & save"}
              </button>
            )}
          </div>
        </>
      )}
      {
        <div className="readiness-support">
          <div>
            <div className="section-heading">
              <h3>Linked decisions</h3>
              <span>{decisions.length}</span>
            </div>
            {decisions.length ? (
              decisions.map((item) => (
                <span className="status-chip neutral" key={item.id}>
                  {item.title} · {item.status}
                </span>
              ))
            ) : (
              <p>
                No decisions linked. This does not fail readiness by itself.
              </p>
            )}
            {!archived && unlinked.length > 0 && (
              <div className="inline-link-form">
                <select
                  aria-label="Decision to link"
                  onChange={(event) => setSelectedDecision(event.target.value)}
                  value={selectedDecision}
                >
                  <option value="">Link a decision</option>
                  {unlinked.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  disabled={!selectedDecision || pending !== null}
                  onClick={() => void link()}
                  type="button"
                >
                  {pending === "link" ? "Linking..." : "Link"}
                </button>
              </div>
            )}
            {archived && (
              <p className="read-only-subnote">
                Decision links are review-only while this project is archived.
              </p>
            )}
          </div>
          <div id="readiness-invariants">
            <div className="section-heading">
              <h3>Applicable invariants</h3>
              <span>{invariants.length}</span>
            </div>
            {invariants.length ? (
              invariants.map((item) => (
                <div className="readiness-invariant" key={item.id}>
                  <div className="readiness-invariant-copy">
                    <strong>
                      {item.title} · rev {item.revision}
                    </strong>
                    <p>{item.statement}</p>
                    <small>Why: {item.rationale}</small>
                  </div>
                  {item.needs_acknowledgement && !archived ? (
                    <button
                      className="button ghost"
                      disabled={pending !== null}
                      onClick={() => void acknowledge(item.id, item.revision)}
                      type="button"
                    >
                      {pending === item.id
                        ? "Reviewing..."
                        : "Acknowledge review"}
                    </button>
                  ) : (
                    <small>
                      {item.needs_acknowledgement && archived
                        ? "Review only · project archived"
                        : "Reviewed · not technical proof"}
                    </small>
                  )}
                </div>
              ))
            ) : (
              <p>No active invariants apply.</p>
            )}
          </div>
        </div>
      }
      <div className="readiness-history">
        <div className="section-heading">
          <div>
            <h3>Saved evaluation snapshots</h3>
            <p>
              Snapshots remain unchanged; STALE means the current planning
              context has changed.
            </p>
          </div>
          <span>{history.length}</span>
        </div>
        {history.length ? (
          history.map((item) => (
            <div className="history-row" key={item.evaluation_id}>
              <span>
                <strong className="history-kind">SAVED SNAPSHOT</strong>
                {stamp(item.evaluated_at)}
              </span>
              <strong>{item.outcome}</strong>
              <span className={item.stale ? "history-stale" : ""}>
                {item.stale ? (
                  <>
                    <strong>STALE</strong>
                    <small>context changed</small>
                  </>
                ) : "CURRENT INPUTS"}
              </span>
            </div>
          ))
        ) : (
          <p>No saved evaluations yet. Preview does not create history.</p>
        )}
      </div>
      <p className="planning-disclaimer">
        Delivery verification: not available in this milestone.
      </p>
    </section>
  );
}
