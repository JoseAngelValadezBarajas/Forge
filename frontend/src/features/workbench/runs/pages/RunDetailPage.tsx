/* API-loading effects synchronize external SQLite-backed state and are guarded by AbortController. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  forgeApi,
  type AgentRun,
  type RunEvent,
  type RunOutputReference,
  type RunStatus,
  type RunEventType,
  type Workspace,
} from "../../../../api";
import { PageFrame } from "../../../../shared/ui/PageFrame";
import { StatusChip } from "../../../../shared/ui/StatusChip";
import { formatDate } from "../../../../shared/utils/formatDate";
import { type PaletteOpener } from "../../pages/types";
import { errorMessage } from "../../utils";
import { Loading } from "../../components/Loading";
import { ErrorBox } from "../../components/ErrorBox";
import { ProvenanceBanner } from "../../components/ProvenanceBanner";

export function RunDetailPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: PaletteOpener;
}) {
  const { projectId = "", runId = "" } = useParams<{
    projectId: string;
    runId: string;
  }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [outputs, setOutputs] = useState<RunOutputReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventType, setEventType] = useState<RunEventType>("progress");
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputLabel, setOutputLabel] = useState("");
  const [outputSummary, setOutputSummary] = useState("");
  const [outputProvenance, setOutputProvenance] = useState("");
  const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (!workspace || !projectId || !runId) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const [item, timeline, reportedOutputs] = await Promise.all([
        forgeApi.getRun(workspace.id, projectId, runId, controller.signal),
        forgeApi.listRunEvents(
          workspace.id,
          projectId,
          runId,
          controller.signal,
        ),
        forgeApi.listRunOutputs(
          workspace.id,
          projectId,
          runId,
          controller.signal,
        ),
      ]);
      if (!controller.signal.aborted) {
        setRun(item);
        setEvents(timeline);
        setOutputs(reportedOutputs);
        setError(null);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(errorMessage(cause, "Could not load this run."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [projectId, runId, workspace]);
  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);
  const action = async (work: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not update this run."));
    } finally {
      setPending(false);
    }
  };
  const submitEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!run) return;
    await action(async () => {
      await forgeApi.addRunEvent(workspace!.id, projectId, run.id, {
        event_type: eventType,
        title: eventTitle,
        description: eventDescription,
        expected_version: run.version,
      });
      setEventTitle("");
      setEventDescription("");
      setEventOpen(false);
    });
  };
  const submitOutput = async (event: FormEvent) => {
    event.preventDefault();
    if (!run) return;
    await action(async () => {
      await forgeApi.addRunOutput(workspace!.id, projectId, run.id, {
        label: outputLabel,
        summary: outputSummary,
        provenance: outputProvenance,
        expected_version: run.version,
      });
      setOutputLabel("");
      setOutputSummary("");
      setOutputProvenance("");
      setOutputOpen(false);
    });
  };
  const prepareHandoff = async () => {
    if (!run) return;
    setPending(true);
    setError(null);
    try {
      const handoff = await forgeApi.createHandoff(
        workspace!.id,
        projectId,
        run.id,
        {
          title: `Next step for ${run.title}`,
          summary: "",
          outcomes: "",
          blockers: "",
          questions: "",
          next_actions: "",
          references: "",
        },
      );
      navigate(`/projects/${projectId}/handoffs/${handoff.id}`);
    } catch (cause) {
      setError(errorMessage(cause, "Could not prepare the handoff."));
    } finally {
      setPending(false);
    }
  };
  if (loading)
    return (
      <PageFrame
        onOpenPalette={onOpenPalette}
        subtitle="Loading durable reported context."
        title="Run Detail & Timeline"
      >
        <Loading />
      </PageFrame>
    );
  if (error && !run)
    return (
      <PageFrame
        onOpenPalette={onOpenPalette}
        subtitle="The record could not be loaded."
        title="Run Detail & Timeline"
      >
        <ErrorBox message={error} onRetry={() => void load()} />
      </PageFrame>
    );
  if (!run) return null;
  const nextStates: RunStatus[] =
    run.status === "PLANNED"
      ? ["IN_PROGRESS", "CANCELLED"]
      : run.status === "IN_PROGRESS"
        ? ["AWAITING_HANDOFF", "COMPLETED", "FAILED", "CANCELLED"]
        : run.status === "AWAITING_HANDOFF"
          ? ["COMPLETED", "FAILED", "CANCELLED"]
          : [];
  return (
    <PageFrame
      onOpenPalette={onOpenPalette}
      subtitle="A durable account of the context received and the work actually reported."
      title="Run Detail & Timeline"
    >
      <div className="fnd05-detail-toolbar">
        <StatusChip className="fnd05-status" status={run.status} />
        <div className="form-actions">
          {nextStates.slice(0, 1).map((state) => (
            <button
              className="button secondary"
              disabled={pending}
              key={state}
              onClick={() =>
                void action(() =>
                  forgeApi.updateRunStatus(
                    workspace!.id,
                    projectId,
                    run.id,
                    state,
                    run.version,
                  ),
                )
              }
              type="button"
            >
              Move to {state.replaceAll("_", " ")}
            </button>
          ))}
          <button
            className="button secondary"
            disabled={pending}
            onClick={() => setEventOpen((value) => !value)}
            type="button"
          >
            + Add event
          </button>
          <button
            className="button secondary"
            disabled={pending}
            onClick={() => setOutputOpen((value) => !value)}
            type="button"
          >
            + Add output
          </button>
          <button
            className="button primary"
            disabled={pending}
            onClick={() => void prepareHandoff()}
            type="button"
          >
            Prepare handoff
          </button>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      <section className="fnd05-panel fnd05-run-identity">
        <span className="eyebrow accent">RUN RECORD</span>
        <h2>{run.title}</h2>
        <p>
          Feature {run.feature_id} · Recorded manually ·{" "}
          {run.started_at
            ? `Started ${formatDate(run.started_at)}`
            : "Not started"}
        </p>
        <hr />
        <p className="fnd05-fingerprint">
          Context: {run.context_schema_version} · SHA-256{" "}
          {run.context_fingerprint.slice(0, 16)}…
        </p>
      </section>
      {eventOpen && (
        <form className="fnd05-panel fnd05-event-form" onSubmit={submitEvent}>
          <div className="section-heading">
            <h2>Report activity</h2>
            <button
              className="icon-button"
              onClick={() => setEventOpen(false)}
              type="button"
              aria-label="Close activity form"
            >
              ×
            </button>
          </div>
          <label>
            Type
            <select
              aria-label="Event type"
              onChange={(event) => setEventType(event.target.value as RunEventType)}
              value={eventType}
            >
              <option value="progress">Progress</option>
              <option value="blocker">Blocker</option>
              <option value="decision_note">Decision note</option>
              <option value="general_note">General note</option>
            </select>
          </label>
          <label>
            Title
            <input
              aria-label="Event title"
              onChange={(event) => setEventTitle(event.target.value)}
              value={eventTitle}
            />
          </label>
          <label>
            Description
            <textarea
              aria-label="Event description"
              onChange={(event) => setEventDescription(event.target.value)}
              rows={4}
              value={eventDescription}
            />
          </label>
          <button className="button primary" disabled={pending} type="submit">
            Report event
          </button>
        </form>
      )}
      {outputOpen && (
        <form className="fnd05-panel fnd05-event-form" onSubmit={submitOutput}>
          <div className="section-heading">
            <h2>Report an output</h2>
            <button
              className="icon-button"
              onClick={() => setOutputOpen(false)}
              type="button"
              aria-label="Close output form"
            >
              ×
            </button>
          </div>
          <label>
            Label
            <input
              aria-label="Output label"
              onChange={(event) => setOutputLabel(event.target.value)}
              value={outputLabel}
            />
          </label>
          <label>
            Summary
            <textarea
              aria-label="Output summary"
              onChange={(event) => setOutputSummary(event.target.value)}
              rows={3}
              value={outputSummary}
            />
          </label>
          <label>
            Provenance
            <textarea
              aria-label="Output provenance"
              onChange={(event) => setOutputProvenance(event.target.value)}
              rows={3}
              value={outputProvenance}
            />
          </label>
          <p className="planning-disclaimer">
            This is a declared reference. Forge does not open or verify local
            files, commits or external content.
          </p>
          <button className="button primary" disabled={pending} type="submit">
            Report output
          </button>
        </form>
      )}
      <div className="fnd05-detail-grid">
        <section className="fnd05-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">APPEND-ONLY REPORTED TIMELINE</span>
              <h2>Activity timeline</h2>
            </div>
            <span className="mono-label">{events.length} events</span>
          </div>
          <p className="planning-disclaimer">
            Events are reported by a person; timestamps are not CI evidence.
          </p>
          <div className="fnd05-stack">
            {events.map((item) => (
              <article className="fnd05-event" key={item.id}>
                <span className="fnd05-event-time">
                  {formatDate(item.recorded_at)}
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  {item.supersedes_event_id && (
                    <span className="mono-label">
                      Correction of {item.supersedes_event_id.slice(0, 8)}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
        <aside className="fnd05-side-stack">
          <section className="fnd05-panel">
            <span className="eyebrow">RUN LIFECYCLE</span>
            <p>{run.status.replaceAll("_", " ")}</p>
            <p className="planning-disclaimer">
              Next transitions are explicit and terminal states cannot silently
              revert.
            </p>
          </section>
          <section className="fnd05-panel">
            <span className="eyebrow">REPORTED OUTPUTS</span>
            {outputs.length ? (
              <div className="fnd05-stack">
                {outputs.map((item) => (
                  <article className="fnd05-output" key={item.id}>
                    <strong>{item.label}</strong>
                    <p>{item.summary}</p>
                    <span className="mono-label">{item.provenance}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="planning-disclaimer">No reported outputs yet.</p>
            )}
          </section>
        </aside>
      </div>
      <ProvenanceBanner />
    </PageFrame>
  );
}
