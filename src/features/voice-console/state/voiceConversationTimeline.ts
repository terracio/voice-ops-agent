import type { VoiceTranscriptTurn } from "../evidence/voiceConsoleTranscript";

export type ConversationTimelineActor = "agent" | "caller";
export type ConversationTimelineSegmentStatus = "estimated" | "final" | "live";

export type ConversationTimelineSegment = {
  actor: ConversationTimelineActor;
  endOffsetMs: number;
  id: string;
  startOffsetMs: number;
  status: ConversationTimelineSegmentStatus;
};

export type ConversationTimelineLane = {
  actor: ConversationTimelineActor;
  label: string;
  segments: ConversationTimelineSegment[];
};

export type ConversationTimelineModel = {
  durationMs: number;
  elapsedMs: number;
  lanes: ConversationTimelineLane[];
};

const MIN_SEGMENT_MS = 900;
const MAX_SEGMENT_MS = 7_500;
const MS_PER_WORD = 360;

export function buildConversationTimelineModel(options: {
  callStartedAtMs?: number;
  elapsedMs: number;
  turns: VoiceTranscriptTurn[];
}): ConversationTimelineModel {
  const elapsedMs = Math.max(0, Math.round(options.elapsedMs));
  const speechTurns = options.turns.filter((turn) =>
    (turn.actor === "assistant" || turn.actor === "user") && turn.text.trim()
  );
  const parsedTimes = speechTurns.map((turn) => turn.createdAtMs ?? parseEvidenceTimeMs(turn.at));
  const baseMs = timelineBaseMs(options.callStartedAtMs, parsedTimes);
  const segments = speechTurns
    .map((turn, index) =>
      toEstimatedSegment({
        baseMs,
        elapsedMs,
        fallbackStartMs: index * MIN_SEGMENT_MS,
        parsedTimeMs: parsedTimes[index],
        turn
      })
    )
    .filter((segment): segment is ConversationTimelineSegment => Boolean(segment))
    .sort((left, right) => left.startOffsetMs - right.startOffsetMs);
  const durationMs = Math.max(
    elapsedMs,
    ...segments.map((segment) => segment.endOffsetMs),
    0
  );

  return {
    durationMs,
    elapsedMs,
    lanes: [{
      actor: "caller",
      label: "Caller",
      segments: segments.filter((segment) => segment.actor === "caller")
    }, {
      actor: "agent",
      label: "Agent",
      segments: segments.filter((segment) => segment.actor === "agent")
    }]
  };
}

export function formatTimelineTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function toEstimatedSegment(options: {
  baseMs?: number;
  elapsedMs: number;
  fallbackStartMs: number;
  parsedTimeMs?: number;
  turn: VoiceTranscriptTurn;
}): ConversationTimelineSegment | undefined {
  const rawStartMs = options.baseMs !== undefined && options.parsedTimeMs !== undefined
    ? options.parsedTimeMs - options.baseMs
    : options.fallbackStartMs;
  const startOffsetMs = clamp(Math.round(rawStartMs), 0, options.elapsedMs);
  const estimatedEndMs = startOffsetMs + estimateSpeechDurationMs(options.turn.text);
  const endOffsetMs = clamp(Math.round(estimatedEndMs), startOffsetMs, options.elapsedMs);
  if (endOffsetMs <= startOffsetMs) return undefined;

  return {
    actor: options.turn.actor === "assistant" ? "agent" : "caller",
    endOffsetMs,
    id: options.turn.id,
    startOffsetMs,
    status: estimatedEndMs > options.elapsedMs ? "live" : "estimated"
  };
}

function estimateSpeechDurationMs(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(wordCount * MS_PER_WORD, MIN_SEGMENT_MS, MAX_SEGMENT_MS);
}

function timelineBaseMs(
  callStartedAtMs: number | undefined,
  parsedTimes: Array<number | undefined>
): number | undefined {
  const validTimes = parsedTimes.filter((value): value is number => value !== undefined);
  if (validTimes.length === 0) return callStartedAtMs;
  if (callStartedAtMs === undefined) return Math.min(...validTimes);
  const hasPlausibleCallRelativeTime = validTimes.some((value) => value >= callStartedAtMs);
  return hasPlausibleCallRelativeTime ? callStartedAtMs : Math.min(...validTimes);
}

function parseEvidenceTimeMs(value: string): number | undefined {
  const isoMs = Date.parse(value);
  if (Number.isFinite(isoMs)) return isoMs;

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return undefined;
  const [, hour = "0", minute = "0", second = "0", millis = "0"] = match;
  return (
    ((Number(hour) * 60 + Number(minute)) * 60 + Number(second)) * 1000 +
    Number(millis.padEnd(3, "0"))
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
