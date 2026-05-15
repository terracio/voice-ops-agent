"use client";

import { useRef, type RefObject } from "react";
import { AgentAvatar, Icon, Waveform } from "./voiceConsoleIcons";
import { VoiceEvidencePanels } from "./VoiceEvidencePanels";
import {
  ActivityItem,
  ControlButton,
  Panel,
  StatusPair,
  TechItem,
  type VoiceConsoleViewActionHandler
} from "./VoiceConsolePrimitives";
import { useRealtimeEvidence } from "../hooks/useRealtimeEvidence";
import { useVoiceConsoleRealtime } from "../hooks/useVoiceConsoleRealtime";
import {
  toHandoffLabel,
  toModeLabel,
  toPermissionLabel,
  toStatusLabel
} from "../evidence/voiceConsoleLabels";
import {
  type VoiceConsoleController,
  type VoiceConsoleState
} from "../state/voiceConsoleController";
import {
  EMPTY_VOICE_CONSOLE_EVIDENCE,
  type VoiceConsoleEvidenceState
} from "../evidence/voiceConsoleEvidence";
import { buildVoiceTranscriptState } from "../evidence/voiceConsoleTranscript";

type VoiceConsoleProps = {
  controller?: VoiceConsoleController;
};

type VoiceConsoleViewProps = {
  evidence?: VoiceConsoleEvidenceState;
  remoteAudioRef?: RefObject<HTMLAudioElement | null>;
  state: VoiceConsoleState;
  onAction: VoiceConsoleViewActionHandler;
};

const meterBars = Array.from({ length: 16 }, (_, index) => index);

export function VoiceConsole({
  controller
}: VoiceConsoleProps) {
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const { onAction, state } = useVoiceConsoleRealtime({
    controller,
    remoteAudioRef
  });
  const evidence = useRealtimeEvidence({
    callId: state.callId,
    enabled: !controller && state.sessionStatus === "connected" && Boolean(state.callId)
  });

  return (
    <VoiceConsoleView
      evidence={evidence}
      remoteAudioRef={remoteAudioRef}
      state={state}
      onAction={onAction}
    />
  );
}

export function VoiceConsoleView({
  evidence = EMPTY_VOICE_CONSOLE_EVIDENCE,
  remoteAudioRef,
  state,
  onAction
}: VoiceConsoleViewProps) {
  const statusLabel = toStatusLabel(state.sessionStatus);
  const permissionLabel = toPermissionLabel(state.microphonePermission);
  const activeBars = Math.round((state.inputLevel / 100) * meterBars.length);
  const transcript = buildVoiceTranscriptState(evidence.transcript);

  return (
    <main className="voice-shell">
      <header className="topbar" aria-label="Voice console status">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="brand" />
          </span>
          <h1>MealPlan VoiceOps</h1>
        </div>
        <div className="topbar-meta" aria-label="Session configuration">
          <StatusPair label="Session" value={state.sessionLabel} tone="teal" />
          <StatusPair label="Model" value={state.model} tone="neutral" />
        </div>
        <div className={`connection-state ${state.sessionStatus}`}>
          <span className="status-dot" aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>
      </header>

      <div className="console-grid">
        <section className="console-left" aria-label="Call controls">
          <Panel title="Agent" icon="headset">
            <div className="agent-layout">
              <AgentAvatar />
              <div className="agent-main">
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
                  <audio ref={remoteAudioRef} className="remote-audio" />
                  <span className="mini-icon" aria-hidden="true">
                    <Icon name="speaker" />
                  </span>
                  <span>{state.assistantAudioLabel}</span>
                </div>
                <LiveTranscript
                  actor="agent"
                  label="Agent transcript"
                  text={transcript.currentAgentText}
                />
              </div>
            </div>
            <div className="call-controls" aria-label="Call controls">
              <ControlButton
                label="Start"
                detail="Start session"
                icon="play"
                tone="primary"
                disabled={state.sessionStatus !== "disconnected"}
                onClick={() => onAction({ type: "start" })}
              />
              <ControlButton
                label="Stop"
                detail="Stop session"
                icon="stop"
                disabled={state.sessionStatus === "disconnected"}
                onClick={() => onAction({ type: "stop" })}
              />
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
          </Panel>

          <Panel title="Caller" icon="user">
            <div className="caller-grid">
              <div className="caller-mic" aria-label="Caller microphone">
                <span className="caller-avatar" aria-hidden="true">
                  <Icon name="mic" />
                </span>
                <div>
                  <p className="field-title">Microphone</p>
                  <p className={`field-value ${state.microphonePermission}`}>
                    <Icon name={state.microphonePermission === "granted" ? "check" : "question"} />
                    {permissionLabel}
                  </p>
                </div>
              </div>
              <div className="input-meter">
                <p className="field-title">Input level</p>
                <div
                  className="meter"
                  aria-label={`Input level ${state.inputLevel} percent`}
                >
                  {meterBars.map((bar) => (
                    <span
                      className={bar < activeBars ? "active" : undefined}
                      key={bar}
                    />
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
            <div className="customer-context">
              <span className="context-icon" aria-hidden="true">
                <Icon name="user" />
              </span>
              <div>
                <p className="field-title">Customer context</p>
                <p>{state.customerContext}</p>
              </div>
            </div>
            <LiveTranscript
              actor="caller"
              label="Caller transcript"
              text={transcript.currentCallerText}
            />
          </Panel>
        </section>

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
      </div>

      <VoiceEvidencePanels evidence={evidence} transcript={transcript.history} />

      <section className="technical-strip" aria-label="Technical state">
        <TechItem icon="hash" label="Call ID" value={state.callId ?? "-"} />
        <TechItem
          icon="link"
          label="Control handoff"
          value={toHandoffLabel(state.controlHandoff)}
          badge={state.controlHandoff === "pending" ? "Pending" : "Attached"}
        />
        <TechItem
          icon="shield"
          label="Server call setup"
          value={state.serverCallSetup === "created" ? "Ready" : "-"}
        />
        <TechItem icon="lock" label="Tools" value={state.serverToolsLabel} />
      </section>
    </main>
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
