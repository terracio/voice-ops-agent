import { EstimatedCost } from "./VoiceEvidencePanels";
import { Icon } from "./voiceConsoleIcons";
import {
  ActivityItem,
  TechItem,
  type VoiceConsoleViewActionHandler
} from "./VoiceConsolePrimitives";
import type { VoiceConsoleEvidenceState } from "../evidence/voiceConsoleEvidence";
import { toHandoffLabel } from "../evidence/voiceConsoleLabels";
import type { VoiceConsoleState } from "../state/voiceConsoleController";

type VoiceConsoleTracePanelProps = {
  evidence: VoiceConsoleEvidenceState;
  state: VoiceConsoleState;
  onAction: VoiceConsoleViewActionHandler;
};

export function VoiceConsoleTracePanel({
  evidence,
  state,
  onAction
}: VoiceConsoleTracePanelProps) {
  return (
    <div className="trace-stack">
      <section className="activity-panel" aria-labelledby="activity-heading">
        <div className="panel-title activity-title">
          <div>
            <Icon name="activity" />
            <h2 id="activity-heading">Live activity</h2>
          </div>
          <button
            className="clear-button"
            type="button"
            onClick={() => onAction({ type: "clearActivity" })}
          >
            <Icon name="trash" />
            <span>Clear</span>
          </button>
        </div>
        <ol className="activity-feed" aria-label="Live controller activity">
          {state.events.map((event) => (
            <ActivityItem event={event} key={event.id} />
          ))}
        </ol>
      </section>

      <section className="technical-strip" aria-label="Technical state">
        <TechItem icon="hash" label="Call ID" value={state.callId ?? evidence.callId ?? "-"} />
        <TechItem
          icon="link"
          label="Control handoff"
          value={toHandoffLabel(state.controlHandoff)}
          badge={state.controlHandoff === "pending" ? "Pending" : "Attached"}
        />
        <TechItem icon="shield" label="Server call setup" value={setupLabel(state)} />
        <TechItem icon="lock" label="Tools" value={state.serverToolsLabel} />
        <TechItem icon="activity" label="Model" value={state.model} />
        <TechItem icon="hash" label="Run ID" value={evidence.runId ?? "-"} />
        <TechItem icon="activity" label="Evidence" value={evidenceStatusLabel(evidence)} />
        <TechItem icon="lock" label="Schema" value={evidence.schemaVersion ?? "-"} />
      </section>

      <section className="trace-grid" aria-label="Trace diagnostics">
        <div className="trace-card">
          <div className="trace-card-heading">
            <h2>Realtime events</h2>
            <span>{evidence.events.length} captured</span>
          </div>
          {evidence.events.length === 0 ? (
            <p className="trace-empty">No realtime transport events captured yet.</p>
          ) : (
            <ol className="trace-event-list">
              {evidence.events.slice(-12).map((event) => (
                <li className={`trace-event ${event.severity}`} key={event.id}>
                  <span>{event.at}</span>
                  <strong>{event.eventType}</strong>
                  <p>{event.label}</p>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="trace-card">
          <div className="trace-card-heading">
            <h2>Cost telemetry</h2>
            <span>{evidence.cost?.estimateStatus ?? "unavailable"}</span>
          </div>
          <EstimatedCost cost={evidence.cost} />
          {evidence.limitations?.length ? (
            <ul className="trace-limitations" aria-label="Evidence limitations">
              {evidence.limitations.map((limitation) => (
                <li className={limitation.severity} key={limitation.code}>
                  <strong>{limitation.code}</strong>
                  <span>{limitation.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function setupLabel(state: VoiceConsoleState): string {
  return state.serverCallSetup === "created" ? "Ready" : "-";
}

function evidenceStatusLabel(evidence: VoiceConsoleEvidenceState): string {
  if (evidence.snapshotStatus) return evidence.snapshotStatus;
  return evidence.status;
}
