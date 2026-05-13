"use client";

import { useState, type ReactNode } from "react";
import { AgentAvatar, Icon, Waveform, type IconName } from "./voiceConsoleIcons";
import {
  toHandoffLabel,
  toModeLabel,
  toPermissionLabel,
  toStatusLabel
} from "./voiceConsoleLabels";
import {
  demoVoiceConsoleController,
  type VoiceConsoleAction,
  type VoiceConsoleController,
  type VoiceConsoleState
} from "./voiceConsoleController";

type VoiceConsoleProps = {
  controller?: VoiceConsoleController;
};

type VoiceConsoleViewProps = {
  state: VoiceConsoleState;
  onAction: (action: VoiceConsoleAction) => void;
};

const meterBars = Array.from({ length: 16 }, (_, index) => index);

export function VoiceConsole({
  controller = demoVoiceConsoleController
}: VoiceConsoleProps) {
  const [state, setState] = useState(() => controller.getInitialState());

  function handleAction(action: VoiceConsoleAction) {
    setState((current) => controller.dispatch(current, action));
  }

  return <VoiceConsoleView state={state} onAction={handleAction} />;
}

export function VoiceConsoleView({ state, onAction }: VoiceConsoleViewProps) {
  const statusLabel = toStatusLabel(state.sessionStatus);
  const permissionLabel = toPermissionLabel(state.microphonePermission);
  const activeBars = Math.round((state.inputLevel / 100) * meterBars.length);

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
                  <span className="mini-icon" aria-hidden="true">
                    <Icon name="speaker" />
                  </span>
                  <span>{state.assistantAudioLabel}</span>
                </div>
              </div>
            </div>
            <div className="call-controls" aria-label="Call controls">
              <ControlButton
                label="Start"
                detail="Start session"
                icon="play"
                tone="primary"
                disabled={state.sessionStatus === "connected"}
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
          label="Ephemeral credential (browser)"
          value={state.ephemeralCredential === "issued" ? "Issued" : "-"}
        />
        <TechItem icon="lock" label="Tools" value={state.serverToolsLabel} />
      </section>
    </main>
  );
}

function Panel({
  title,
  icon,
  children
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <section className="console-panel" aria-labelledby={`${title.toLowerCase()}-title`}>
      <div className="panel-title">
        <Icon name={icon} />
        <h2 id={`${title.toLowerCase()}-title`}>{title}</h2>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function StatusPair({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "teal" | "neutral";
}) {
  return (
    <div className="status-pair">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function ControlButton({
  label,
  detail,
  icon,
  tone = "neutral",
  disabled = false,
  pressed,
  onClick
}: {
  label: string;
  detail: string;
  icon: IconName;
  tone?: "primary" | "neutral";
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`${label}: ${detail}`}
      aria-pressed={pressed}
      className={`control-button ${tone}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

function ActivityItem({
  event
}: {
  event: VoiceConsoleState["events"][number];
}) {
  return (
    <li className="activity-item">
      <time>{event.at}</time>
      <span className={`event-icon ${event.tone}`} aria-hidden="true">
        <Icon name={event.tone === "info" ? "info" : event.tone === "ready" || event.tone === "success" ? "check" : "question"} />
      </span>
      <div className="event-copy">
        <strong>{event.title}</strong>
        <p>{event.detail}</p>
      </div>
      <span className={`event-label ${event.tone}`}>{event.label}</span>
    </li>
  );
}

function TechItem({
  icon,
  label,
  value,
  badge
}: {
  icon: IconName;
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="tech-item">
      <span className="tech-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div>
        <p>{label}</p>
        {badge ? <strong className="tech-badge">{badge}</strong> : <strong>{value}</strong>}
      </div>
    </div>
  );
}
