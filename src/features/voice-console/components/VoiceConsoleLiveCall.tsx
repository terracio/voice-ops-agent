import { AgentAvatar, Icon, Waveform } from "./voiceConsoleIcons";
import {
  ControlButton,
  Panel,
  type VoiceConsoleViewActionHandler
} from "./VoiceConsolePrimitives";
import {
  formatEvidenceStatus,
  type VoiceConsoleEvidenceState
} from "../evidence/voiceConsoleEvidence";
import {
  toHandoffLabel,
  toModeLabel,
  toPermissionLabel,
  toStatusLabel
} from "../evidence/voiceConsoleLabels";
import type { VoiceTranscriptState } from "../evidence/voiceConsoleTranscript";
import type { VoiceConsoleState } from "../state/voiceConsoleController";

type VoiceConsoleLiveCallProps = {
  evidence: VoiceConsoleEvidenceState;
  state: VoiceConsoleState;
  transcript: VoiceTranscriptState;
  onAction: VoiceConsoleViewActionHandler;
};

const meterBars = Array.from({ length: 16 }, (_, index) => index);

export function VoiceConsoleLiveCall({
  evidence,
  state,
  transcript,
  onAction
}: VoiceConsoleLiveCallProps) {
  return (
    <section className="live-call-grid" aria-label="Live call cockpit">
      <div className="live-call-left">
        <Panel title="Call metrics" icon="activity">
          <div className="metrics-grid">
            <Metric label="Session" value={state.sessionLabel} />
            <Metric label="Connection" value={toStatusLabel(state.sessionStatus)} />
            <Metric label="Estimated cost" value={costMetric(evidence)} />
            <Metric label="Control handoff" value={toHandoffLabel(state.controlHandoff)} />
          </div>
        </Panel>

        <Panel title="Current audio" icon="headset">
          <div className="audio-cockpit">
            <AgentAvatar />
            <div className="audio-cockpit-main">
              <div className="agent-heading-row">
                <div>
                  <h3>MealPlan Agent</h3>
                  <p>
                    Mode <span className="soft-chip">{toModeLabel(state.agentMode)}</span>
                  </p>
                </div>
                <span className="mode-pill">{toModeLabel(state.agentMode)}</span>
              </div>
              <Waveform />
              <div className="audio-output">
                <span className="mini-icon" aria-hidden="true">
                  <Icon name="speaker" />
                </span>
                <span>{state.assistantAudioLabel}</span>
              </div>
            </div>
          </div>
          <CallerAudioStatus state={state} />
        </Panel>

        <Panel title="Conversation timeline" icon="activity">
          <div className="timeline-skeleton" aria-label="Conversation timeline summary">
            <TimelineLane
              label="Caller"
              tone="caller"
              value={transcript.currentCallerText ? "Latest speech captured" : "No speech yet"}
            />
            <TimelineLane
              label="Agent"
              tone="agent"
              value={transcript.currentAgentText ? "Latest speech captured" : "No speech yet"}
            />
          </div>
        </Panel>

        <Panel title="Current speech" icon="mic">
          <div className="speech-grid">
            <LiveTranscript
              actor="caller"
              label="Caller"
              text={transcript.currentCallerText}
            />
            <LiveTranscript
              actor="agent"
              label="MealPlan Agent"
              text={transcript.currentAgentText}
            />
          </div>
        </Panel>

        <div className="call-controls" aria-label="Call controls">
          <PrimaryCallButton state={state} onAction={onAction} />
          <ControlButton
            label="Mute"
            detail={state.isMuted ? "Mic muted" : "Mute mic"}
            icon="mic"
            disabled={state.sessionStatus !== "connected"}
            pressed={state.isMuted}
            onClick={() => onAction({ type: "toggleMute" })}
          />
          <ControlButton
            label="Reset"
            detail="Reset session"
            icon="reset"
            onClick={() => onAction({ type: "reset" })}
          />
        </div>
      </div>

      <aside className="live-call-right" aria-label="Agent action and safety">
        <Panel title="Agent action" icon="activity">
          <ActionBanner state={state} />
        </Panel>
        <Panel title="Customer summary" icon="user">
          <p className="skeleton-copy">{state.customerContext}</p>
          <p className="safety-note">Private reads and writes stay blocked until server identity evidence is confirmed.</p>
        </Panel>
        <Panel title="ChangeSet preview" icon="shield">
          <p className="skeleton-copy">No pending ChangeSet preview.</p>
          <p className="safety-note">The browser can display deltas only after the server creates and validates them.</p>
        </Panel>
        <Panel title="Tool and policy summary" icon="lock">
          <ToolPolicySummary evidence={evidence} state={state} />
        </Panel>
      </aside>
    </section>
  );
}

function CallerAudioStatus({ state }: { state: VoiceConsoleState }) {
  const activeBars = Math.round((state.inputLevel / 100) * meterBars.length);
  return (
    <div className="caller-grid live-caller-grid">
      <div className="caller-mic" aria-label="Caller microphone">
        <span className="caller-avatar" aria-hidden="true">
          <Icon name="mic" />
        </span>
        <div>
          <p className="field-title">Caller</p>
          <p className={`field-value ${state.microphonePermission}`}>
            <Icon name={state.microphonePermission === "granted" ? "check" : "question"} />
            {toPermissionLabel(state.microphonePermission)}
          </p>
        </div>
      </div>
      <div className="input-meter">
        <p className="field-title">Input level</p>
        <div className="meter" aria-label={`Input level ${state.inputLevel} percent`}>
          {meterBars.map((bar) => (
            <span className={bar < activeBars ? "active" : undefined} key={bar} />
          ))}
        </div>
      </div>
      <div className="caller-status">
        <p className="field-title">Status</p>
        <p className="mute-state">
          <span className="mute-icon" aria-hidden="true">
            <Icon name="mic" />
          </span>
          {state.isMuted ? "Muted" : "Unmuted"}
        </p>
      </div>
    </div>
  );
}

function PrimaryCallButton({
  state,
  onAction
}: {
  state: VoiceConsoleState;
  onAction: VoiceConsoleViewActionHandler;
}) {
  const active = state.sessionStatus !== "disconnected";
  const label = active ? "Hang up" : state.callId ? "Call again" : "Call";
  return (
    <ControlButton
      label={label}
      detail={active ? "End audio" : "Ring MealPlan"}
      icon={active ? "phone-off" : "phone"}
      tone={active ? "neutral" : "primary"}
      onClick={() => onAction({ type: active ? "stop" : "start" })}
    />
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TimelineLane({
  label,
  tone,
  value
}: {
  label: string;
  tone: "agent" | "caller";
  value: string;
}) {
  return (
    <div className="timeline-lane">
      <span>{label}</span>
      <div className={`timeline-track ${tone}`}>
        <i />
      </div>
      <small>{value}</small>
    </div>
  );
}

function LiveTranscript({
  actor,
  label,
  text
}: {
  actor: "agent" | "caller";
  label: string;
  text: string;
}) {
  return (
    <div className={`live-transcript ${actor}`}>
      <p className="field-title">{label}</p>
      <p className={text ? "live-transcript-text" : "live-transcript-empty"}>
        {text || "Waiting for transcript evidence."}
      </p>
    </div>
  );
}

function ActionBanner({ state }: { state: VoiceConsoleState }) {
  return (
    <div className={`action-banner ${state.agentMode}`}>
      <strong>{actionTitle(state)}</strong>
      <span>{actionDetail(state)}</span>
    </div>
  );
}

function ToolPolicySummary({
  evidence,
  state
}: {
  evidence: VoiceConsoleEvidenceState;
  state: VoiceConsoleState;
}) {
  const latestTool = evidence.tools.at(-1);
  return (
    <div className="summary-stack">
      <p className="skeleton-copy">
        Tools: {latestTool
          ? `${latestTool.name} ${formatEvidenceStatus(latestTool.status).toLowerCase()}`
          : state.serverToolsLabel}
      </p>
      <p className="safety-note">
        Policy enforcement and commits remain server-owned; this panel is display-only.
      </p>
    </div>
  );
}

function costMetric(evidence: VoiceConsoleEvidenceState): string {
  if (!evidence.cost) return "Waiting for telemetry";
  if (evidence.cost.estimateStatus === "unavailable") return "Unavailable";
  return evidence.cost.totalLabel ?? "Partial estimate";
}

function actionTitle(state: VoiceConsoleState): string {
  if (state.sessionStatus === "connecting") return "Connecting";
  if (state.sessionStatus === "disconnected") return state.callId ? "Call ended" : "Ready to start";
  if (state.agentMode === "tool-running") return "Server tool running";
  if (state.agentMode === "waiting-for-confirmation") return "Awaiting confirmation";
  return "Listening for caller";
}

function actionDetail(state: VoiceConsoleState): string {
  if (state.sessionStatus === "disconnected") {
    return state.callId
      ? "Call history remains visible until reset."
      : "Start a call to attach browser audio and server sideband control.";
  }
  if (state.agentMode === "tool-running") return "Tool execution is handled by the server.";
  return "The model may propose actions; the application decides writes.";
}
