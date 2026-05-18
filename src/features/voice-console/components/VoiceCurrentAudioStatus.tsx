import type { CSSProperties } from "react";
import { Icon } from "./voiceConsoleIcons";
import type { VoiceConsoleState } from "../state/voiceConsoleController";
import type { LiveCallViewModel } from "../state/voiceConsoleViewModel";

type CallerAudioStatus = "idle" | "speaking" | "muted" | "unavailable";

const bridgeBars = [3, 8, 15, 9, 4, 2, 6, 18, 12, 5, 2, 7, 14, 9, 3];

export function VoiceCurrentAudioStatus({
  agentStatus,
  state
}: {
  agentStatus: LiveCallViewModel["agentAudioStatus"];
  state: VoiceConsoleState;
}) {
  const callerStatus = callerAudioStatus(state);

  return (
    <div
      className={`current-audio-status caller-${callerStatus} agent-${agentStatus}`}
      aria-label="Current audio status"
    >
      <AudioEntity
        detail={callerAudioDetail(callerStatus)}
        label="Caller"
        status={callerStatus}
        tone="caller"
      />
      <AudioBridge
        agentActive={agentStatus === "listening" || agentStatus === "speaking"}
        callerActive={callerStatus === "speaking"}
        inputLevel={state.inputLevel}
      />
      <AudioEntity
        detail={state.assistantAudioLabel}
        label="MealPlan Agent"
        status={agentStatus}
        tone="agent"
      />
    </div>
  );
}

function AudioEntity({
  detail,
  label,
  status,
  tone
}: {
  detail: string;
  label: string;
  status: string;
  tone: "agent" | "caller";
}) {
  return (
    <section className={`audio-entity ${tone}`} aria-label={`${label}: ${detail}`}>
      <div className={`audio-entity-orb ${tone}`} aria-hidden="true">
        {tone === "caller" ? <Icon name="user" /> : <span className="agent-orb-wave" />}
      </div>
      <div className="audio-entity-copy">
        <strong>{label}</strong>
        <span className={`endpoint-status ${status}`}>{statusLabel(status)}</span>
      </div>
    </section>
  );
}

function AudioBridge({
  agentActive,
  callerActive,
  inputLevel
}: {
  agentActive: boolean;
  callerActive: boolean;
  inputLevel: number;
}) {
  return (
    <div className="audio-bridge" aria-hidden="true">
      <BridgeWave active={callerActive} inputLevel={inputLevel} tone="caller" />
      <span className="audio-bridge-spine" />
      <BridgeWave active={agentActive} inputLevel={agentActive ? 72 : 18} tone="agent" />
    </div>
  );
}

function BridgeWave({
  active,
  inputLevel,
  tone
}: {
  active: boolean;
  inputLevel: number;
  tone: "agent" | "caller";
}) {
  const activeBars = Math.max(2, Math.round((inputLevel / 100) * bridgeBars.length));

  return (
    <div className={`bridge-wave ${tone}${active ? " active" : ""}`}>
      {bridgeBars.map((height, index) => (
        <span
          className={index < activeBars ? "active" : undefined}
          key={`${tone}-${height}-${index}`}
          style={{ "--bar-height": `${height}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}

function callerAudioStatus(state: VoiceConsoleState): CallerAudioStatus {
  if (state.sessionStatus !== "connected") return "unavailable";
  if (state.isMuted) return "muted";
  return state.inputLevel > 20 ? "speaking" : "idle";
}

function callerAudioDetail(status: CallerAudioStatus): string {
  if (status === "unavailable") return "Mic unavailable until a call is active";
  if (status === "muted") return "Browser mic is muted";
  if (status === "speaking") return "Input audio is active";
  return "Waiting for caller audio";
}

function statusLabel(status: string): string {
  if (status === "tooling") return "Tooling";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
