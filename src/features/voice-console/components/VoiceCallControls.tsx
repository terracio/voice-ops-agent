import { ControlButton, type VoiceConsoleViewActionHandler } from "./VoiceConsolePrimitives";
import type { VoiceConsoleState } from "../state/voiceConsoleController";

export function VoiceCallControls({
  state,
  onAction
}: {
  state: VoiceConsoleState;
  onAction: VoiceConsoleViewActionHandler;
}) {
  const active = state.sessionStatus !== "disconnected";
  const ended = !active && Boolean(state.callId);

  return (
    <div className="call-controls" aria-label="Call controls">
      <ControlButton
        label={active ? "Hang up" : ended ? "Call again" : "Call"}
        detail={active ? "End audio" : "Ring MealPlan"}
        icon={active ? "phone-off" : "phone"}
        tone={active ? "neutral" : "primary"}
        onClick={() => onAction({ type: active ? "stop" : "start" })}
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
  );
}
