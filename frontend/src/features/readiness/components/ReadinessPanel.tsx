import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forgeApi,
  ApiError,
  type ApplicableInvariant,
  type Decision,
  type Feature,
  type ReadinessEvaluation,
  type Workspace,
} from "../../../api";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { message, stamp } from "../utils";

export function ReadinessPanel({
  workspace,
  projectId,
  feature,
  refreshKey,
}: {
  workspace: Workspace;
  projectId: string;
  feature: Feature;
  refreshKey: string | number;
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
      setPreview(
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
  }, [feature.id, projectId, refreshKey, workspace.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      loadController.current?.abort();
      actionController.current?.abort();
    };
  }, [load]);
  const run = async (kind: "preview" | "save") => {
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
      setPreview(next);
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
              <span>{preview.stale ? "STALE" : preview.rule_set_version}</span>
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
                  <span
                    className="readiness-blocker"
                    key={`${result.rule_id}-${blocker.code}-${blockerIndex}`}
                  >
                    {blocker.message}
                  </span>
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
            <button
              className="button primary"
              disabled={pending !== null}
              onClick={() => void run("save")}
              type="button"
            >
              {pending === "save" ? "Saving..." : "Evaluate & save"}
            </button>
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
            {unlinked.length > 0 && (
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
          </div>
          <div>
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
                  {item.needs_acknowledgement ? (
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
                    <small>Reviewed · not technical proof</small>
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
              <span>{stamp(item.evaluated_at)}</span>
              <strong>{item.outcome}</strong>
              <span className={item.stale ? "history-stale" : ""}>
                {item.stale ? "STALE" : item.input_fingerprint.slice(0, 10)}
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
