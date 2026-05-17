import { REALTIME_RUNTIME_CONFIG } from "../../../realtime/config/runtimeConfig";

export type SessionStatus = "disconnected" | "connecting" | "connected";
export type AgentMode =
  | "idle"
  | "listening"
  | "speaking"
  | "tool-running"
  | "waiting-for-confirmation";
export type MicrophonePermission = "not-requested" | "granted" | "denied";
export type ControlHandoff = "pending" | "attached";
export type ServerCallSetup = "not-created" | "created";
export type ActivityTone = "ready" | "pending" | "info" | "success" | "error";

export type ActivityEvent = {
  id: string;
  at: string;
  tone: ActivityTone;
  title: string;
  detail: string;
  label: string;
};

export type VoiceConsoleState = {
  sessionLabel: "Local demo";
  model: "gpt-realtime-2";
  sessionStatus: SessionStatus;
  agentMode: AgentMode;
  assistantAudioLabel: string;
  microphonePermission: MicrophonePermission;
  isMuted: boolean;
  inputLevel: number;
  customerContext: string;
  callId: string | null;
  controlHandoff: ControlHandoff;
  serverCallSetup: ServerCallSetup;
  serverToolsLabel: "Server-side only";
  events: ActivityEvent[];
};

export type VoiceConsoleAction =
  | { type: "start"; at?: string }
  | { type: "stop"; at?: string }
  | { type: "toggleMute"; at?: string }
  | { type: "reset"; at?: string }
  | { type: "clearActivity"; at?: string };

export type VoiceConsoleController = {
  getInitialState: () => VoiceConsoleState;
  dispatch: (
    state: VoiceConsoleState,
    action: VoiceConsoleAction
  ) => VoiceConsoleState;
};

const DEFAULT_EVENT_TIME = "10:51:24";

export function createInitialVoiceConsoleState(
  at = DEFAULT_EVENT_TIME
): VoiceConsoleState {
  return {
    sessionLabel: "Local demo",
    model: REALTIME_RUNTIME_CONFIG.shared.defaultModel,
    sessionStatus: "disconnected",
    agentMode: "idle",
    assistantAudioLabel: "No audio playing",
    microphonePermission: "not-requested",
    isMuted: true,
    inputLevel: 12,
    customerContext: "No caller identified yet",
    callId: null,
    controlHandoff: "pending",
    serverCallSetup: "not-created",
    serverToolsLabel: "Server-side only",
    events: seedActivityEvents(at)
  };
}

export function applyVoiceConsoleAction(
  state: VoiceConsoleState,
  action: VoiceConsoleAction
): VoiceConsoleState {
  const at = action.at ?? currentClockTime();

  if (action.type === "start") {
    if (state.sessionStatus === "connected") {
      return withEvent(state, {
        id: `already-started-${at}`,
        at,
        tone: "info",
        title: "Session already running",
        detail: "Realtime controls are already attached",
        label: "INFO"
      });
    }

    return withEvent(
      {
        ...state,
        sessionStatus: "connected",
        agentMode: "listening",
        assistantAudioLabel: "Listening for caller audio",
        microphonePermission: "granted",
        isMuted: false,
        inputLevel: 44,
        callId: state.callId ?? createCallId(at),
        controlHandoff: "attached",
        serverCallSetup: "created"
      },
      {
        id: `session-started-${at}`,
        at,
        tone: "success",
        title: "Session started",
        detail: "Browser audio and server sideband are ready",
        label: "LIVE"
      }
    );
  }

  if (action.type === "stop") {
    if (state.sessionStatus === "disconnected") {
      return withEvent(state, {
        id: `already-stopped-${at}`,
        at,
        tone: "info",
        title: "Session already stopped",
        detail: "No active realtime call is attached",
        label: "INFO"
      });
    }

    return withEvent(
      {
        ...state,
        sessionStatus: "disconnected",
        agentMode: "idle",
        assistantAudioLabel: "No audio playing",
        microphonePermission: "not-requested",
        isMuted: true,
        inputLevel: 0,
        controlHandoff: "pending",
        serverCallSetup: "not-created"
      },
      {
        id: `session-stopped-${at}`,
        at,
        tone: "pending",
        title: "Session stopped",
        detail: "Audio stopped; evidence remains available until reset",
        label: "PENDING"
      }
    );
  }

  if (action.type === "toggleMute") {
    if (state.sessionStatus !== "connected") {
      return withEvent(state, {
        id: `mute-unavailable-${at}`,
        at,
        tone: "info",
        title: "Session not connected",
        detail: "Start a session before changing microphone state",
        label: "INFO"
      });
    }

    const nextMuted = !state.isMuted;

    return withEvent(
      {
        ...state,
        isMuted: nextMuted,
        inputLevel: nextMuted ? 0 : 38
      },
      {
        id: `mute-${nextMuted ? "on" : "off"}-${at}`,
        at,
        tone: nextMuted ? "pending" : "success",
        title: nextMuted ? "Caller muted" : "Caller unmuted",
        detail: nextMuted
          ? "Input audio is held in the browser"
          : "Input audio level meter is active",
        label: nextMuted ? "MUTED" : "OPEN"
      }
    );
  }

  if (action.type === "reset") {
    return {
      ...createInitialVoiceConsoleState(DEFAULT_EVENT_TIME),
      events: [
        {
          id: `console-reset-${at}`,
          at,
          tone: "info",
          title: "Console reset",
          detail: "Local demo state returned to idle",
          label: "INFO"
        },
        ...seedActivityEvents(DEFAULT_EVENT_TIME)
      ]
    };
  }

  return {
    ...state,
    events: [
      {
        id: `activity-cleared-${at}`,
        at,
        tone: "info",
        title: "Activity cleared",
        detail: "New controller events will appear here",
        label: "INFO"
      }
    ]
  };
}

export const demoVoiceConsoleController: VoiceConsoleController = {
  getInitialState: createInitialVoiceConsoleState,
  dispatch: applyVoiceConsoleAction
};

function seedActivityEvents(at: string): ActivityEvent[] {
  return [
    {
      id: "ready-to-start",
      at,
      tone: "ready",
      title: "Ready to start",
      detail: "System initialized and ready for session",
      label: "READY"
    },
    {
      id: "microphone-not-requested",
      at,
      tone: "pending",
      title: "Microphone not requested",
      detail: "Start the session to request microphone access",
      label: "PENDING"
    },
    {
      id: "server-sideband-not-attached",
      at,
      tone: "pending",
      title: "Server sideband not attached",
      detail: "Control handoff pending after session start",
      label: "PENDING"
    },
    {
      id: "tools-remain-server-side",
      at,
      tone: "pending",
      title: "Tools remain server-side",
      detail: "All tool execution will occur on the server",
      label: "PENDING"
    },
    {
      id: "session-not-started",
      at,
      tone: "info",
      title: "Session not started",
      detail: "Click Start to begin a realtime session",
      label: "INFO"
    }
  ];
}

function withEvent(
  state: VoiceConsoleState,
  event: ActivityEvent
): VoiceConsoleState {
  return {
    ...state,
    events: [event, ...state.events].slice(0, 8)
  };
}

function createCallId(at: string): string {
  return `local-call-${at.replace(/\D/g, "").padStart(6, "0")}`;
}

function currentClockTime(): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}
