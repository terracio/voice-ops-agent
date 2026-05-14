import type { RealtimeWebrtcControllerState } from "../browser/realtimeWebrtcController";
import type {
  ActivityEvent,
  ActivityTone,
  VoiceConsoleState
} from "./voiceConsoleController";

type RealtimeStateEvent = {
  at: string;
  previousState?: RealtimeWebrtcControllerState;
  state: RealtimeWebrtcControllerState;
};

export function markRealtimeStartRequested(
  state: VoiceConsoleState,
  at: string
): VoiceConsoleState {
  if (state.sessionStatus !== "disconnected") {
    return addEvent(state, {
      at,
      detail: "A realtime browser session is already being prepared",
      id: `start-ignored-${at}`,
      label: "INFO",
      title: "Session already active",
      tone: "info"
    });
  }

  return addEvent(
    {
      ...state,
      agentMode: "idle",
      assistantAudioLabel: "Requesting microphone access",
      callId: null,
      controlHandoff: "pending",
      serverCallSetup: "not-created",
      inputLevel: 0,
      sessionStatus: "connecting"
    },
    {
      at,
      detail: "Browser is requesting microphone access and server call setup",
      id: `realtime-start-requested-${at}`,
      label: "STARTING",
      title: "Starting realtime session",
      tone: "pending"
    }
  );
}

export function markRealtimeState(
  state: VoiceConsoleState,
  event: RealtimeStateEvent
): VoiceConsoleState {
  const next = statePatchForRealtimeState(state, event.state);
  const activity = activityForRealtimeState(event);
  return activity ? addEvent(next, activity) : next;
}

export function markRealtimeCallId(
  state: VoiceConsoleState,
  callId: string,
  at: string
): VoiceConsoleState {
  return addEvent(
    {
      ...state,
      callId,
      serverCallSetup: "created"
    },
    {
      at,
      detail: "Server created the Realtime call and attached sideband control",
      id: `realtime-call-${callId}`,
      label: "CALL",
      title: "Realtime call created",
      tone: "success"
    }
  );
}

export function markRealtimeMuted(
  state: VoiceConsoleState,
  muted: boolean,
  at: string
): VoiceConsoleState {
  return addEvent(
    {
      ...state,
      inputLevel: muted || state.sessionStatus !== "connected" ? 0 : 38,
      isMuted: muted,
      microphonePermission:
        state.sessionStatus === "connected" ? "granted" : state.microphonePermission
    },
    {
      at,
      detail: muted
        ? "Input audio is held in the browser"
        : "Input audio is streaming from the browser",
      id: `realtime-muted-${muted}-${at}`,
      label: muted ? "MUTED" : "OPEN",
      title: muted ? "Caller muted" : "Caller unmuted",
      tone: muted ? "pending" : "success"
    }
  );
}

export function markRealtimeRemoteAudio(
  state: VoiceConsoleState,
  at: string
): VoiceConsoleState {
  return addEvent(
    {
      ...state,
      assistantAudioLabel: "Assistant audio output attached"
    },
    {
      at,
      detail: "Remote assistant audio is connected to the browser output",
      id: `remote-audio-${at}`,
      label: "AUDIO",
      title: "Assistant audio attached",
      tone: "success"
    }
  );
}

export function markRealtimeError(
  state: VoiceConsoleState,
  message: string,
  at: string
): VoiceConsoleState {
  const detail = formatRealtimeErrorMessage(message);

  return addEvent(
    {
      ...state,
      agentMode: "idle",
      assistantAudioLabel: "Realtime session error",
      callId: null,
      controlHandoff: "pending",
      serverCallSetup: "not-created",
      inputLevel: 0,
      isMuted: true,
      microphonePermission: message.toLowerCase().includes("permission")
        ? "denied"
        : state.microphonePermission,
      sessionStatus: "disconnected"
    },
    {
      at,
      detail,
      id: `realtime-error-${at}`,
      label: "ERROR",
      title: "Realtime session failed",
      tone: "error"
    }
  );
}

function statePatchForRealtimeState(
  state: VoiceConsoleState,
  realtimeState: RealtimeWebrtcControllerState
): VoiceConsoleState {
  if (realtimeState === "connecting") {
    return {
      ...state,
      agentMode: "idle",
      assistantAudioLabel: "Connecting to GPT Realtime",
      sessionStatus: "connecting"
    };
  }

  if (realtimeState === "listening") {
    return {
      ...state,
      agentMode: "listening",
      assistantAudioLabel: "Listening for caller audio",
      controlHandoff: "attached",
      serverCallSetup: "created",
      inputLevel: state.isMuted ? 0 : 38,
      microphonePermission: "granted",
      sessionStatus: "connected"
    };
  }

  if (realtimeState === "speaking") {
    return {
      ...state,
      agentMode: "speaking",
      assistantAudioLabel: "Assistant audio playing",
      sessionStatus: "connected"
    };
  }

  if (realtimeState === "tool-running") {
    return {
      ...state,
      agentMode: "tool-running",
      assistantAudioLabel: "Server tools are running",
      sessionStatus: "connected"
    };
  }

  if (realtimeState === "waiting-for-confirmation") {
    return {
      ...state,
      agentMode: "waiting-for-confirmation",
      assistantAudioLabel: "Waiting for caller confirmation",
      sessionStatus: "connected"
    };
  }

  if (realtimeState === "ended") {
    return {
      ...state,
      agentMode: "idle",
      assistantAudioLabel: "No audio playing",
      callId: null,
      controlHandoff: "pending",
      serverCallSetup: "not-created",
      inputLevel: 0,
      isMuted: true,
      microphonePermission: "not-requested",
      sessionStatus: "disconnected"
    };
  }

  return {
    ...state,
    agentMode: "idle",
    assistantAudioLabel: "Realtime session error",
    callId: null,
    sessionStatus: "disconnected"
  };
}

function activityForRealtimeState(
  event: RealtimeStateEvent
): ActivityEvent | undefined {
  if (event.previousState === event.state) return undefined;
  if (event.state === "error") return undefined;

  const at = event.at;
  const details: Record<
    Exclude<RealtimeWebrtcControllerState, "error">,
    { detail: string; label: string; title: string; tone: ActivityTone }
  > = {
    connecting: {
      detail: "Browser media and server Realtime call setup are being prepared",
      label: "CONNECTING",
      title: "Connecting to Realtime",
      tone: "pending"
    },
    ended: {
      detail: "Browser audio, peer connection, and sideband control were closed",
      label: "ENDED",
      title: "Session ended",
      tone: "pending"
    },
    idle: {
      detail: "Realtime controller is idle",
      label: "IDLE",
      title: "Session idle",
      tone: "info"
    },
    listening: {
      detail: "Browser audio and server sideband are attached",
      label: "LIVE",
      title: "Session listening",
      tone: "success"
    },
    speaking: {
      detail: "Assistant audio is playing in the browser",
      label: "AUDIO",
      title: "Assistant speaking",
      tone: "info"
    },
    "tool-running": {
      detail: "Realtime requested a tool; execution remains server-side",
      label: "TOOLS",
      title: "Server tool running",
      tone: "pending"
    },
    "waiting-for-confirmation": {
      detail: "A preview is waiting for an explicit caller confirmation",
      label: "CONFIRM",
      title: "Confirmation required",
      tone: "pending"
    }
  };
  return { at, id: `realtime-state-${event.state}-${at}`, ...details[event.state] };
}

function formatRealtimeErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("permission denied") ||
    normalized.includes("notallowed") ||
    normalized.includes("not allowed")
  ) {
    return "Microphone permission was denied by the browser. Allow microphone access for localhost, then click Start again.";
  }
  return message;
}

function addEvent(
  state: VoiceConsoleState,
  event: ActivityEvent
): VoiceConsoleState {
  return {
    ...state,
    events: [
      event,
      ...state.events.filter((existing) => existing.id !== event.id)
    ].slice(0, 8)
  };
}
