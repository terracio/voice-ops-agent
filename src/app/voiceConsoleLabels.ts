import type { VoiceConsoleState } from "./voiceConsoleController";

export function toStatusLabel(
  status: VoiceConsoleState["sessionStatus"]
): string {
  if (status === "connected") {
    return "Connected";
  }
  if (status === "connecting") {
    return "Connecting";
  }
  return "Disconnected";
}

export function toModeLabel(mode: VoiceConsoleState["agentMode"]): string {
  if (mode === "listening") {
    return "Listening";
  }
  if (mode === "speaking") {
    return "Speaking";
  }
  if (mode === "tool-running") {
    return "Tool running";
  }
  if (mode === "waiting-for-confirmation") {
    return "Waiting for confirmation";
  }
  return "Idle";
}

export function toPermissionLabel(
  permission: VoiceConsoleState["microphonePermission"]
): string {
  if (permission === "granted") {
    return "Permission granted";
  }
  if (permission === "denied") {
    return "Permission denied";
  }
  return "Microphone not requested";
}

export function toHandoffLabel(
  handoff: VoiceConsoleState["controlHandoff"]
): string {
  return handoff === "attached" ? "Attached" : "Pending";
}
