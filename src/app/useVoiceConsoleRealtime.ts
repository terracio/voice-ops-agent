"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";
import {
  createRealtimeWebrtcController,
  type RealtimeWebrtcController,
  type RealtimeWebrtcControllerEvent
} from "../browser/realtimeWebrtcController";
import {
  applyVoiceConsoleAction,
  createInitialVoiceConsoleState,
  type VoiceConsoleAction,
  type VoiceConsoleController
} from "./voiceConsoleController";
import {
  markRealtimeCallId,
  markRealtimeError,
  markRealtimeMuted,
  markRealtimeRemoteAudio,
  markRealtimeStartRequested,
  markRealtimeState
} from "./voiceConsoleRealtimeState";

type RealtimeControllerFactory = (options: {
  remoteAudioElement?: HTMLAudioElement;
}) => RealtimeWebrtcController;

type UseVoiceConsoleRealtimeOptions = {
  controller?: VoiceConsoleController;
  realtimeFactory?: RealtimeControllerFactory;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
};

export function useVoiceConsoleRealtime({
  controller,
  realtimeFactory = createRealtimeWebrtcController,
  remoteAudioRef
}: UseVoiceConsoleRealtimeOptions) {
  const [state, setState] = useState(() =>
    controller?.getInitialState() ?? createInitialVoiceConsoleState()
  );
  const realtimeRef = useRef<RealtimeWebrtcController | null>(null);

  useEffect(() => {
    return () => {
      realtimeRef.current?.stop();
    };
  }, []);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeWebrtcControllerEvent) => {
      const at = currentClockTime();
      if (event.type === "state") {
        setState((current) =>
          markRealtimeState(current, {
            at,
            previousState: event.previousState,
            state: event.state
          })
        );
      } else if (event.type === "call-id") {
        setState((current) => markRealtimeCallId(current, event.callId, at));
      } else if (event.type === "muted") {
        setState((current) => markRealtimeMuted(current, event.muted, at));
      } else if (event.type === "remote-stream") {
        setState((current) => markRealtimeRemoteAudio(current, at));
      } else if (event.type === "error") {
        setState((current) => markRealtimeError(current, event.error.message, at));
      }
    },
    []
  );

  const getRealtimeController = useCallback(() => {
    if (!realtimeRef.current) {
      const runtime = realtimeFactory({
        remoteAudioElement: remoteAudioRef.current ?? undefined
      });
      runtime.subscribe(handleRealtimeEvent);
      realtimeRef.current = runtime;
    }
    return realtimeRef.current;
  }, [handleRealtimeEvent, realtimeFactory, remoteAudioRef]);

  const onAction = useCallback(
    async (action: VoiceConsoleAction) => {
      const at = currentClockTime();

      if (controller) {
        setState((current) => controller.dispatch(current, action));
        return;
      }

      if (action.type === "start") {
        setState((current) => markRealtimeStartRequested(current, at));
        const runtime = getRealtimeController();
        if (!isStartable(runtime.state)) return;
        try {
          await runtime.start();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unable to start session.";
          if (
            runtime.state !== "error" &&
            !message.toLowerCase().includes("cancelled")
          ) {
            setState((current) => markRealtimeError(current, message, at));
          }
        }
        return;
      }

      if (action.type === "stop") {
        realtimeRef.current?.stop();
        setState((current) =>
          applyVoiceConsoleAction(current, { ...action, at })
        );
        return;
      }

      if (action.type === "toggleMute") {
        realtimeRef.current?.toggleMuted();
        return;
      }

      if (action.type === "reset") {
        realtimeRef.current?.reset();
        setState((current) =>
          applyVoiceConsoleAction(current, { ...action, at })
        );
        return;
      }

      setState((current) => applyVoiceConsoleAction(current, { ...action, at }));
    },
    [controller, getRealtimeController]
  );

  return { onAction, state };
}

function isStartable(state: RealtimeWebrtcController["state"]): boolean {
  return state === "idle" || state === "ended" || state === "error";
}

function currentClockTime(): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}
