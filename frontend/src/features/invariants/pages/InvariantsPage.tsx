import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  forgeApi,
  type Feature,
  type Invariant,
  type InvariantCreatePayload,
  type Workspace,
} from "../../../api";
import { ErrorPanel } from "../../../shared/ui/ErrorPanel";
import { LoadingPanel } from "../../../shared/ui/LoadingPanel";
import { PageFrame } from "../../../shared/ui/PageFrame";
import { type PaletteOpener } from "./types";
import { message } from "../utils";
import { InvariantForm } from "../components/InvariantForm";

export function InvariantsPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const [invariants, setInvariants] = useState<Invariant[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invariant | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!workspace || !projectId) return;
      setLoading(true);
      try {
        const [nextInvariants, nextFeatures] = await Promise.all([
          forgeApi.listInvariants(workspace.id, projectId, true, signal),
          forgeApi.listFeatures(workspace.id, projectId, {}, signal),
        ]);
        setInvariants(Array.isArray(nextInvariants) ? nextInvariants : []);
        setFeatures(Array.isArray(nextFeatures) ? nextFeatures : []);
        setError(null);
      } catch (cause) {
        if (!signal?.aborted)
          setError(message(cause, "Could not load invariants."));
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
  const create = (payload: InvariantCreatePayload) =>
    mutate(async () => {
      if (!workspace || !projectId) return;
      await forgeApi.createInvariant(workspace.id, projectId, payload);
      setFormOpen(false);
    }, "Could not create invariant.");
  const update = (payload: InvariantCreatePayload) =>
    mutate(async () => {
      if (!workspace || !projectId || !editing) return;
      await forgeApi.updateInvariant(
        workspace.id,
        projectId,
        editing.id,
        payload,
      );
      setEditing(null);
    }, "Could not update invariant.");
  const retire = (item: Invariant) => {
    if (
      !workspace ||
      !projectId ||
      !window.confirm(`Retire ${item.title}? It will remain in history.`)
    )
      return;
    void mutate(
      () => forgeApi.retireInvariant(workspace.id, projectId, item.id),
      "Could not retire invariant.",
    );
  };
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Durable constraints that remain visible while a project evolves."
      title="Project Invariants"
    >
      <div className="fnd-toolbar">
        <div>
          <span className="eyebrow">INVARIANT INVENTORY</span>
          <p>Acknowledged means reviewed, not technically compliant.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setFormOpen(true)}
          type="button"
        >
          + New invariant
        </button>
      </div>
      {(formOpen || editing) && (
        <InvariantForm
          features={features}
          initial={
            editing
              ? {
                  title: editing.title,
                  statement: editing.statement,
                  rationale: editing.rationale,
                  feature_id: editing.feature_id ?? undefined,
                }
              : undefined
          }
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={editing ? update : create}
          submitLabel={editing ? "Save invariant" : "Create invariant"}
        />
      )}
      {error && <ErrorPanel message={error} onRetry={() => void load()} />}
      {loading ? (
        <LoadingPanel label="Loading invariants" />
      ) : invariants.length ? (
        <div className="fnd-record-list">
          {invariants.map((item) => (
            <article className="fnd-record-card" key={item.id}>
              <div className="fnd-record-header">
                <div>
                  <span className="mono-label">
                    REVISION {item.revision} ·{" "}
                    {item.feature_id ? "FEATURE" : "PROJECT"}
                  </span>
                  <h3>{item.title}</h3>
                </div>
                <span className={`status-chip ${item.status}`}>
                  {item.status}
                </span>
              </div>
              <p>{item.statement}</p>
              <small>Why: {item.rationale}</small>
              <div className="fnd-record-actions">
                {item.status === "active" && (
                  <>
                    <button
                      className="button ghost"
                      onClick={() => setEditing(item)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="button ghost"
                      onClick={() => retire(item)}
                      type="button"
                    >
                      Retire
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <div>
            <span className="eyebrow accent">NO INVARIANTS YET</span>
            <h3>Make the constraint explicit</h3>
            <p>
              Project invariants will apply to every Feature; feature invariants
              remain local.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setFormOpen(true)}
            type="button"
          >
            Create invariant
          </button>
        </div>
      )}
    </PageFrame>
  );
}
