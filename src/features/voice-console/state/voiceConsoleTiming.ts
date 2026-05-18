export type CallTimingState = {
  startedAtMs?: number;
  endedAtMs?: number;
  nowMs: number;
};

export function createIdleCallTiming(nowMs = Date.now()): CallTimingState {
  return { nowMs };
}

export function startCallTiming(
  timing: CallTimingState,
  nowMs = Date.now()
): CallTimingState {
  return {
    startedAtMs: timing.startedAtMs ?? nowMs,
    nowMs
  };
}

export function tickCallTiming(
  timing: CallTimingState,
  nowMs = Date.now()
): CallTimingState {
  return { ...timing, nowMs };
}

export function endCallTiming(
  timing: CallTimingState,
  nowMs = Date.now()
): CallTimingState {
  if (timing.endedAtMs) return { ...timing, nowMs: timing.endedAtMs };
  return timing.startedAtMs
    ? { ...timing, endedAtMs: nowMs, nowMs }
    : { nowMs };
}

export function elapsedCallMs(timing: CallTimingState): number {
  if (!timing.startedAtMs) return 0;
  const endMs = timing.endedAtMs ?? timing.nowMs;
  return Math.max(0, endMs - timing.startedAtMs);
}

export function clockTimeToMs(value: string): number {
  const [hours = 0, minutes = 0, seconds = 0] = value
    .split(":")
    .map((part) => Number.parseInt(part, 10) || 0);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}
