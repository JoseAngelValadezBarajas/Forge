/* API-loading effects synchronize external SQLite-backed state and are guarded by AbortController. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  forgeApi,
  type Handoff,
  type HandoffRevision,
  type Workspace,
} from "../../../../api";
import { PageFrame } from "../../../../shared/ui/PageFrame";
import { DownloadLink } from "../../../../shared/ui/DownloadLink";
import { formatDate } from "../../../../shared/utils/formatDate";
import { type PaletteOpener } from "../../pages/types";
import { errorMessage } from "../../utils";
import { Loading } from "../../components/Loading";
import { ErrorBox } from "../../components/ErrorBox";
import { StatusChip } from "../../components/StatusChip";
import { ReportField } from "../../components/ReportField";
import { ProvenanceBanner } from "../../components/ProvenanceBanner";

export function HandoffDetailPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const { projectId = "", handoffId = "" } = useParams<{
    projectId: string;
    handoffId: string;
  }>();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [revisions, setRevisions] = useState<HandoffRevision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    title: "",
    summary: "",
    outcomes: "",
    blockers: "",
    questions: "",
    next_actions: "",
    references: "",
  });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const [item, published] = await Promise.all([
        forgeApi.getHandoff(
          workspace.id,
          projectId,
          handoffId,
          controller.signal,
        ),
        forgeApi.listHandoffRevisions(
          workspace.id,
          projectId,
          handoffId,
          controller.signal,
        ),
      ]);
      if (!controller.signal.aborted) {
        setHandoff(item);
        setRevisions(published);
        setSelectedRevision(item.current_revision || null);
        setForm({
          title: item.title,
          summary: item.summary,
          outcomes: item.outcomes,
          blockers: item.blockers,
          questions: item.questions,
          next_actions: item.next_actions,
          references: item.references,
        });
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(errorMessage(cause, "Could not load this handoff."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [handoffId, projectId, workspace]);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || !handoff || handoff.status !== "DRAFT") return;
    setPending(true);
    setError(null);
    try {
      const updated = await forgeApi.updateHandoff(
        workspace.id,
        projectId,
        handoff.id,
        { ...form, expected_version: handoff.version },
      );
      setHandoff(updated);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save the draft."));
    } finally {
      setPending(false);
    }
  };

  const transition = async (work: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not update this handoff."));
    } finally {
      setPending(false);
    }
  };

  if (!workspace)
    return (
      <PageFrame
        onOpenPalette={onOpenPalette}
        subtitle="Select a workspace to review handoffs."
        title="Handoff Review & Acknowledge"
      >
        <Loading />
      </PageFrame>
    );
  const activeWorkspace = workspace;
  if (loading)
    return (
      <PageFrame
        onOpenPalette={onOpenPalette}
        subtitle="Loading reviewable context."
        title="Handoff Review & Acknowledge"
      >
        <Loading />
      </PageFrame>
    );
  if (!handoff)
    return (
      <PageFrame
        onOpenPalette={onOpenPalette}
        subtitle="The handoff could not be loaded."
        title="Handoff Review & Acknowledge"
      >
        <ErrorBox
          message={error ?? "Handoff not found."}
          onRetry={() => void load()}
        />
      </PageFrame>
    );

  const selected =
    revisions.find((revision) => revision.revision === selectedRevision) ??
    handoff.published_revision;
  const currentPublished =
    revisions.find(
      (revision) => revision.revision === handoff.current_revision,
    ) ?? handoff.published_revision;
  const selectedAcknowledgement = (handoff.acknowledgements ?? []).find(
    (item) => item.revision === selected?.revision,
  );
  const canAcknowledge =
    handoff.status === "READY" &&
    selected?.revision === handoff.current_revision;
  const downloadBase = selected
    ? `/api/workspaces/${activeWorkspace.id}/projects/${projectId}/handoffs/${handoff.id}/revisions/${selected.revision}/download`
    : "";

  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="Receive the report, context and unresolved questions in one inspectable place."
      title="Handoff Review & Acknowledge"
    >
      <div className="fnd05-detail-toolbar">
        <StatusChip status={handoff.status} />
        <div className="form-actions">
          <Link
            className="button secondary"
            to={`/projects/${projectId}/runs/${handoff.run_id}`}
          >
            Source run
          </Link>
          {selected && (
            <>
              <DownloadLink
                aria-label={`Download revision ${selected.revision} as JSON`}
                className="button secondary"
                download
                href={`${downloadBase}?format=json`}
              >
                Export JSON
              </DownloadLink>
              <DownloadLink
                aria-label={`Download revision ${selected.revision} as Markdown`}
                className="button secondary"
                download
                href={`${downloadBase}?format=markdown`}
              >
                Export Markdown
              </DownloadLink>
            </>
          )}
          {canAcknowledge && (
            <button
              className="button primary"
              disabled={pending}
              onClick={() =>
                void transition(() =>
                  forgeApi.acknowledgeHandoff(
                    activeWorkspace.id,
                    projectId,
                    handoff.id,
                    handoff.current_revision,
                    "manual reviewer",
                  ),
                )
              }
              type="button"
            >
              Acknowledge
            </button>
          )}
          {handoff.status === "ACKNOWLEDGED" && (
            <button
              className="button secondary"
              disabled={pending}
              onClick={() =>
                void transition(() =>
                  forgeApi.reviseHandoff(
                    activeWorkspace.id,
                    projectId,
                    handoff.id,
                    handoff.version,
                  ),
                )
              }
              type="button"
            >
              Create correction draft
            </button>
          )}
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      <section className="fnd05-panel fnd05-handoff-source">
        <span className="eyebrow accent">SOURCE RUN</span>
        <h2>{handoff.title}</h2>
        <p>
          Run {handoff.run_id} · Pinned Context Package{" "}
          {handoff.context_package_id}
        </p>
        {currentPublished && (
          <p className="fnd05-fingerprint">
            {currentPublished.schema_version} · SHA-256{" "}
            {currentPublished.fingerprint.slice(0, 16)}…
          </p>
        )}
      </section>
      {handoff.status === "DRAFT" ? (
        <form className="fnd05-panel fnd05-handoff-form" onSubmit={save}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">HANDOFF DRAFT</span>
              <h2>What should the next person know?</h2>
            </div>
            <span className="status-chip neutral">MANUALLY AUTHORED</span>
          </div>
          {(
            [
              "title",
              "summary",
              "outcomes",
              "blockers",
              "questions",
              "next_actions",
              "references",
            ] as const
          ).map((field) => (
            <label key={field}>
              {field.replaceAll("_", " ")}{" "}
              {field === "title" ? (
                <input
                  aria-label={field}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                  value={form[field]}
                />
              ) : (
                <textarea
                  aria-label={field}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                  rows={field === "summary" ? 3 : 2}
                  value={form[field]}
                />
              )}
            </label>
          ))}
          <p className="planning-disclaimer">
            The receiving person must review this handoff. No automatic
            acknowledgement occurs.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={pending}
              type="submit"
            >
              {pending ? "Saving…" : "Save draft"}
            </button>
            <button
              className="button primary"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void transition(async () => {
                  const updated = await forgeApi.updateHandoff(
                    activeWorkspace.id,
                    projectId,
                    handoff.id,
                    { ...form, expected_version: handoff.version },
                  );
                  await forgeApi.readyHandoff(
                    activeWorkspace.id,
                    projectId,
                    handoff.id,
                    updated.version,
                  );
                });
              }}
              type="button"
            >
              Mark ready
            </button>
          </div>
        </form>
      ) : (
        <div className="fnd05-detail-grid">
          <section className="fnd05-panel fnd05-report">
            <span className="eyebrow">WHAT WAS REPORTED</span>
            <h2>{selected?.summary || "No summary was reported."}</h2>
            <ReportField
              label="Reported outcomes"
              value={selected?.outcomes ?? handoff.outcomes}
            />
            <ReportField
              label="Blockers & uncertainty"
              value={selected?.blockers ?? handoff.blockers}
            />
            <ReportField
              label="Open questions"
              value={selected?.questions ?? handoff.questions}
            />
            <ReportField
              label="Recommended next actions"
              value={selected?.next_actions ?? handoff.next_actions}
            />
            <ReportField
              label="References"
              value={selected?.references ?? handoff.references}
            />
          </section>
          <aside className="fnd05-side-stack">
            <section className="fnd05-panel">
              <h2>What acknowledgement means</h2>
              <p>
                I read this handoff and accepted responsibility for further
                review.
              </p>
              <p className="status-error">
                It does NOT certify implementation, testing or delivery
                correctness.
              </p>
            </section>
            <section className="fnd05-panel">
              <span className="eyebrow">AUDIT TRAIL</span>
              <p>Draft created · {formatDate(handoff.created_at)}</p>
              <p>
                {handoff.ready_at
                  ? `Marked ready · ${formatDate(handoff.ready_at)}`
                  : "Not marked ready"}
              </p>
              <p>
                {handoff.acknowledged_at
                  ? `Acknowledged · ${formatDate(handoff.acknowledged_at)}`
                  : "Awaiting acknowledgement"}
              </p>
              {handoff.status === "READY" && !handoff.acknowledgement && (
                <p className="status-warning">
                  Current revision is ready and awaits acknowledgement.
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
      <section className="fnd05-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">IMMUTABLE HISTORY</span>
            <h2>Published revisions</h2>
          </div>
          <span className="mono-label">{revisions.length} revisions</span>
        </div>
        {handoff.status === "DRAFT" && (
          <p className="planning-disclaimer">
            The editable draft above is not a published revision. Published
            snapshots below remain immutable.
          </p>
        )}
        {revisions.length ? (
          <div className="fnd05-revision-history">
            <nav
              aria-label="Published handoff revisions"
              className="fnd05-revision-list"
            >
              {revisions.map((revision) => {
                const acknowledgement = (handoff.acknowledgements ?? []).find(
                  (item) => item.revision === revision.revision,
                );
                return (
                  <button
                    aria-pressed={selected?.revision === revision.revision}
                    className={`fnd05-revision-choice${selected?.revision === revision.revision ? " selected" : ""}`}
                    key={revision.id}
                    onClick={() => setSelectedRevision(revision.revision)}
                    type="button"
                  >
                    <strong>
                      Revision {revision.revision}
                      {revision.revision === handoff.current_revision
                        ? " · Current"
                        : ""}
                    </strong>
                    <span>{formatDate(revision.created_at)}</span>
                    <span>{revision.fingerprint.slice(0, 16)}…</span>
                    <span>
                      {acknowledgement
                        ? `Acknowledged · ${formatDate(acknowledgement.acknowledged_at)}`
                        : "Not acknowledged"}
                    </span>
                  </button>
                );
              })}
            </nav>
            {selected && (
              <article className="fnd05-revision">
                <strong>
                  Revision {selected.revision}
                  {selected.revision === handoff.current_revision
                    ? " · Current published"
                    : " · Historical"}
                </strong>
                <span>{selected.fingerprint}</span>
                {selectedAcknowledgement ? (
                  <span className="status-success">
                    Acknowledged by{" "}
                    {selectedAcknowledgement.acknowledged_by ?? "reviewer"} ·{" "}
                    {formatDate(selectedAcknowledgement.acknowledged_at)}
                  </span>
                ) : (
                  <span className="status-warning">
                    No acknowledgement recorded for this revision.
                  </span>
                )}
                <h3>{selected.title}</h3>
                <ReportField label="Summary" value={selected.summary} />
                <ReportField
                  label="Next actions"
                  value={selected.next_actions}
                />
                <pre>{selected.markdown}</pre>
              </article>
            )}
          </div>
        ) : (
          <p className="planning-disclaimer">
            No published revision exists until the draft is marked ready.
          </p>
        )}
      </section>
      <ProvenanceBanner />
    </PageFrame>
  );
}
