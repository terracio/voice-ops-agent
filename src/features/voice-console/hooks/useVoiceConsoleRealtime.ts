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
} from "../../../realtime/browser/webrtcController";
import {
  createBrowserRingbackTone,
  type RingbackTone,
  type RingbackToneFactory
} from "../../../realtime/browser/ringback";
import {
  applyVoiceConsoleAction,
  createInitialVoiceConsoleState,
  type VoiceConsoleAction,
  type VoiceConsoleController
} from "../state/voiceConsoleController";
import {
  markRealtimeCallId,
  markRealtimeError,
  markRealtimeGreetingRequested,
  markRealtimeMuted,
  markRealtimeRemoteAudio,
  markRealtimeStartRequested,
  markRealtimeState
} from "../state/voiceConsoleRealtimeState";

type RealtimeControllerFactory = (options: {
  remoteAudioElement?: HTMLAudioElement;
}) => RealtimeWebrtcController;

type UseVoiceConsoleRealtimeOptions = {
  controller?: VoiceConsoleController;
  ringbackFactory?: RingbackToneFactory;
  realtimeFactory?: RealtimeControllerFactory;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
};

export function useVoiceConsoleRealtime({
  controller,
  ringbackFactory = createBrowserRingbackTone,
  realtimeFactory = createRealtimeWebrtcController,
  remoteAudioRef
}: UseVoiceConsoleRealtimeOptions) {
  const [state, setState] = useState(() =>
    controller?.getInitialState() ?? createInitialVoiceConsoleState()
  );
  const ringbackRef = useRef<RingbackTone | null>(null);
  const realtimeRef = useRef<RealtimeWebrtcController | null>(null);

  useEffect(() => {
    return () => {
      ringbackRef.current?.stop();
      realtimeRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setState((current) =>
        current.callTiming.startedAtMs && !current.callTiming.endedAtMs
          ? applyVoiceConsoleAction(current, {
            type: "tick",
            at: currentClockTime(),
            nowMs: Date.now()
          })
          : current
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const getRingbackTone = useCallback(() => {
    if (!ringbackRef.current) ringbackRef.current = ringbackFactory();
    return ringbackRef.current;
  }, [ringbackFactory]);

  const stopRingback = useCallback(() => {
    ringbackRef.current?.stop();
  }, []);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeWebrtcControllerEvent) => {
      const at = currentClockTime();
      const nowMs = Date.now();
      if (event.type === "state") {
        if (stopsRingback(event.state)) stopRingback();
        setState((current) =>
          markRealtimeState(current, {
            at,
            nowMs,
            previousState: event.previousState,
            state: event.state
          })
        );
      } else if (event.type === "call-id") {
        setState((current) => markRealtimeCallId(current, event.callId, at));
      } else if (event.type === "greeting-requested") {
        setState((current) => markRealtimeGreetingRequested(current, at));
      } else if (event.type === "muted") {
        setState((current) => markRealtimeMuted(current, event.muted, at));
      } else if (event.type === "remote-stream") {
        setState((current) => markRealtimeRemoteAudio(current, at));
      } else if (event.type === "error") {
        setState((current) =>
          markRealtimeError(current, event.error.message, at, nowMs)
        );
      }
    },
    [stopRingback]
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
      const nowMs = Date.now();

      if (controller) {
        setState((current) => controller.dispatch(current, { ...action, at, nowMs }));
        return;
      }

      if (action.type === "start") {
        setState((current) => markRealtimeStartRequested(current, at, nowMs));
        const runtime = getRealtimeController();
        if (!isStartable(runtime.state)) return;
        getRingbackTone().start();
        try {
          await runtime.start();
        } catch (error) {
          stopRingback();
          const message =
            error instanceof Error ? error.message : "Unable to start session.";
          if (
            runtime.state !== "error" &&
            !message.toLowerCase().includes("cancelled")
          ) {
            setState((current) => markRealtimeError(current, message, at, nowMs));
          }
        }
        return;
      }

      if (action.type === "stop") {
        stopRingback();
        realtimeRef.current?.stop();
        setState((current) =>
          applyVoiceConsoleAction(current, { ...action, at, nowMs })
        );
        return;
      }

      if (action.type === "toggleMute") {
        realtimeRef.current?.toggleMuted();
        return;
      }

      if (action.type === "reset") {
        stopRingback();
        realtimeRef.current?.reset();
        setState((current) =>
          applyVoiceConsoleAction(current, { ...action, at, nowMs })
        );
        return;
      }

      setState((current) => applyVoiceConsoleAction(current, { ...action, at, nowMs }));
    },
    [controller, getRealtimeController, getRingbackTone, stopRingback]
  );

  return { onAction, state };
}

function isStartable(state: RealtimeWebrtcController["state"]): boolean {
  return state === "idle" || state === "ended" || state === "error";
}

function stopsRingback(state: RealtimeWebrtcController["state"]): boolean {
  return (
    state === "listening" ||
    state === "speaking" ||
    state === "ended" ||
    state === "error"
  );
}

function currentClockTime(): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}
