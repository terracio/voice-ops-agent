import { AgentAvatar, Icon, Waveform } from "./voiceConsoleIcons";
import { VoiceAgentSafetyPanel } from "./VoiceAgentSafetyPanel";
import {
  ControlButton,
  Panel,
  type VoiceConsoleViewActionHandler
} from "./VoiceConsolePrimitives";
import type { VoiceConsoleEvidenceState } from "../evidence/voiceConsoleEvidence";
import {
  toHandoffLabel,
  toModeLabel,
  toPermissionLabel,
  toStatusLabel
} from "../evidence/voiceConsoleLabels";
import type { VoiceTranscriptState } from "../evidence/voiceConsoleTranscript";
import type { VoiceConsoleState } from "../state/voiceConsoleController";
import { buildLiveCallViewModel } from "../state/voiceConsoleViewModel";

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
  const liveCall = buildLiveCallViewModel({ evidence, state });

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

      <VoiceAgentSafetyPanel
        model={liveCall}
        serverToolsLabel={state.serverToolsLabel}
      />
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

function costMetric(evidence: VoiceConsoleEvidenceState): string {
  if (!evidence.cost) return "Waiting for telemetry";
  if (evidence.cost.estimateStatus === "unavailable") return "Unavailable";
  return evidence.cost.totalLabel ?? "Partial estimate";
}
