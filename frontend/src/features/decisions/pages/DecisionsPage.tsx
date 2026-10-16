import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  forgeApi,
  type Decision,
  type DecisionCreatePayload,
  type DecisionRevision,
  type Workspace,
} from "../../../api";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { type PaletteOpener } from "./types";
import { message } from "../utils";
import { DecisionForm } from "../components/DecisionForm";
import { DecisionCard } from "../components/DecisionCard";

export function DecisionsPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Decision | null>(null);
  const [history, setHistory] = useState<Record<string, DecisionRevision[]>>(
    {},
  );
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!workspace || !projectId) return;
      setLoading(true);
      try {
        const next = await forgeApi.listDecisions(
          workspace.id,
          projectId,
          signal,
        );
        setDecisions(Array.isArray(next) ? next : []);
        setError(null);
      } catch (cause) {
        if (!signal?.aborted)
          setError(message(cause, "Could not load decisions."));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [projectId, workspace],
  );
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const mutate = async (action: () => Promise<unknown>, fallback: string) => {
    try {
      await action();
      await load();
      return true;
    } catch (cause) {
      setError(message(cause, fallback));
      return false;
    }
  };
  const create = (payload: DecisionCreatePayload) =>
    mutate(async () => {
      if (!workspace || !projectId) return;
      await forgeApi.createDecision(workspace.id, projectId, payload);
      setFormOpen(false);
    }, "Could not create decision.");
  const update = (payload: DecisionCreatePayload) =>
    mutate(async () => {
      if (!workspace || !projectId || !editing) return;
      await forgeApi.updateDecision(
        workspace.id,
        projectId,
        editing.id,
        payload,
      );
      setEditing(null);
    }, "Could not update decision.");
  const accept = (decision: Decision) => {
    if (!workspace || !projectId) return;
    void mutate(
      () => forgeApi.acceptDecision(workspace.id, projectId, decision.id),
      "Could not accept decision.",
    );
  };
  const supersede = (decision: Decision) => {
    if (!workspace || !projectId) return;
    const title = window.prompt("Successor decision title", decision.title);
    if (!title) return;
    const payload = {
      title,
      context: decision.context,
      decision: decision.decision,
      rationale: decision.rationale,
      alternatives_considered: decision.alternatives_considered ?? undefined,
      tradeoffs: decision.tradeoffs ?? undefined,
    };
    void mutate(
      () =>
        forgeApi.supersedeDecision(
          workspace.id,
          projectId,
          decision.id,
          payload,
        ),
      "Could not supersede decision.",
    );
  };
  const showHistory = async (decision: Decision) => {
    if (!workspace || !projectId) return;
    try {
      const items = await forgeApi.listDecisionRevisions(
        workspace.id,
        projectId,
        decision.id,
      );
      setHistory((current) => ({ ...current, [decision.id]: items }));
    } catch (cause) {
      setError(message(cause, "Could not load decision history."));
    }
  };
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Durable product context for why Forge work exists."
      title="Project Decisions"
    >
      <div className="fnd-toolbar">
        <div>
          <span className="eyebrow">DECISION INVENTORY</span>
          <p>Decisions are reported context, not technical verification.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setFormOpen(true)}
          type="button"
        >
          + New decision
        </button>
      </div>
      {(formOpen || editing) && (
        <DecisionForm
          initial={
            editing
              ? {
                  title: editing.title,
                  context: editing.context,
                  decision: editing.decision,
                  rationale: editing.rationale,
                  alternatives_considered:
                    editing.alternatives_considered ?? undefined,
                  tradeoffs: editing.tradeoffs ?? undefined,
                }
              : undefined
          }
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={editing ? update : create}
          submitLabel={editing ? "Save decision" : "Create decision"}
        />
      )}
      {error && <ErrorPanel message={error} onRetry={() => void load()} />}
      {loading ? (
        <LoadingPanel label="Loading decisions" />
      ) : decisions.length ? (
        <div className="fnd-record-list">
          {decisions.map((decision) => (
            <div key={decision.id}>
              <DecisionCard
                decision={decision}
                onAccept={accept}
                onEdit={setEditing}
                onHistory={(item) => void showHistory(item)}
                onSupersede={supersede}
              />
              {history[decision.id] && (
                <div
                  className="fnd-history"
                  aria-label={`History for ${decision.title}`}
                >
                  <strong>Historical revisions</strong>
                  {history[decision.id].map((item, index) => (
                    <details
                      key={item.id}
                      open={index === history[decision.id].length - 1}
                    >
                      <summary>
                        Revision {item.revision} · {item.title} · {item.status}
                      </summary>
                      <div className="fnd-history-detail">
                        <p>
                          <strong>Context</strong>
                          {item.context}
                        </p>
                        <p>
                          <strong>Decision</strong>
                          {item.decision}
                        </p>
                        <p>
                          <strong>Rationale</strong>
                          {item.rationale}
                        </p>
                        {item.alternatives_considered && (
                          <p>
                            <strong>Alternatives</strong>
                            {item.alternatives_considered}
                          </p>
                        )}
                        {item.tradeoffs && (
                          <p>
                            <strong>Tradeoffs</strong>
                            {item.tradeoffs}
                          </p>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <div>
            <span className="eyebrow accent">NO DECISIONS YET</span>
            <h3>Preserve the first important choice</h3>
            <p>Capture context before a feature becomes implementation work.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => setFormOpen(true)}
            type="button"
          >
            Create decision
          </button>
        </div>
      )}
    </PageFrame>
  );
}
