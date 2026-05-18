import type { ReactNode } from "react";
import { Icon, Waveform } from "./voiceConsoleIcons";
import type { VoiceConsoleState } from "../state/voiceConsoleController";
import type { LiveCallViewModel } from "../state/voiceConsoleViewModel";

type CallerAudioStatus = "idle" | "speaking" | "muted" | "unavailable";

const callerMeterBars = Array.from({ length: 12 }, (_, index) => index);

export function VoiceCurrentAudioStatus({
  agentStatus,
  state
}: {
  agentStatus: LiveCallViewModel["agentAudioStatus"];
  state: VoiceConsoleState;
}) {
  const callerStatus = callerAudioStatus(state);

  return (
    <div className="current-audio-status" aria-label="Current audio status">
      <AudioEndpoint
        detail={callerAudioDetail(callerStatus)}
        label="Caller"
        status={callerStatus}
        tone="caller"
      >
        <CallerMeter inputLevel={state.inputLevel} status={callerStatus} />
      </AudioEndpoint>
      <AudioEndpoint
        detail={state.assistantAudioLabel}
        label="MealPlan Agent"
        status={agentStatus}
        tone="agent"
      >
        <div className={`endpoint-wave ${agentStatus}`}>
          <Waveform />
        </div>
      </AudioEndpoint>
    </div>
  );
}

function AudioEndpoint({
  children,
  detail,
  label,
  status,
  tone
}: {
  children: ReactNode;
  detail: string;
  label: string;
  status: string;
  tone: "agent" | "caller";
}) {
  return (
    <div className={`audio-endpoint ${tone}`}>
      <div className="audio-endpoint-heading">
        <span className="endpoint-icon" aria-hidden="true">
          <Icon name={tone === "caller" ? "mic" : "headset"} />
        </span>
        <div>
          <h3>{label}</h3>
          <p>{detail}</p>
        </div>
        <span className={`endpoint-status ${status}`}>
          {statusLabel(status)}
        </span>
      </div>
      {children}
    </div>
  );
}

function CallerMeter({
  inputLevel,
  status
}: {
  inputLevel: number;
  status: CallerAudioStatus;
}) {
  const activeBars = Math.round((inputLevel / 100) * callerMeterBars.length);

  return (
    <div
      className={`caller-meter ${status}`}
      aria-label={`Caller input level ${inputLevel} percent`}
    >
      {callerMeterBars.map((bar) => (
        <span className={bar < activeBars ? "active" : undefined} key={bar} />
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
