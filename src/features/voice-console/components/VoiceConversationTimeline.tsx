import type { CSSProperties } from "react";
import type { VoiceTranscriptState } from "../evidence/voiceConsoleTranscript";
import {
  buildConversationTimelineModel,
  formatTimelineTime,
  type ConversationTimelineSegment
} from "../state/voiceConversationTimeline";
import {
  elapsedCallMs,
  type CallTimingState
} from "../state/voiceConsoleTiming";

type VoiceConversationTimelineProps = {
  callTiming: CallTimingState;
  transcript: VoiceTranscriptState;
};

const rulerTicks = [0, 0.25, 0.5, 0.75, 1] as const;

export function VoiceConversationTimeline({
  callTiming,
  transcript
}: VoiceConversationTimelineProps) {
  const timeline = buildConversationTimelineModel({
    callStartedAtMs: callTiming.startedAtMs,
    elapsedMs: elapsedCallMs(callTiming),
    turns: transcript.history
  });
  const durationMs = Math.max(timeline.durationMs, 1);
  const markerLeft = Math.min(100, (timeline.elapsedMs / durationMs) * 100);

  return (
    <div
      aria-label={`Conversation timeline, elapsed ${formatTimelineTime(timeline.elapsedMs)}`}
      className="conversation-timeline"
    >
      <div className="conversation-timeline-header">
        <span>Elapsed</span>
        <strong>{formatTimelineTime(timeline.elapsedMs)}</strong>
      </div>
      <div className="conversation-ruler" aria-hidden="true">
        <span />
        <div className="conversation-ruler-track">
          {rulerTicks.map((tick) => (
            <span
              className="conversation-ruler-tick"
              key={tick}
              style={{ left: `${tick * 100}%` }}
            >
              {formatTimelineTime(timeline.durationMs * tick)}
            </span>
          ))}
        </div>
      </div>
      <div className="conversation-lanes">
        {timeline.lanes.map((lane) => (
          <div className="conversation-lane" key={lane.actor}>
            <span className={`conversation-lane-label ${lane.actor}`}>{lane.label}</span>
            <div
              aria-label={`${lane.label} speech timeline`}
              className="conversation-track"
              role="img"
            >
              {lane.segments.map((segment) => (
                <TimelineSegment
                  durationMs={durationMs}
                  elapsedMs={timeline.elapsedMs}
                  key={segment.id}
                  label={lane.label}
                  segment={segment}
                />
              ))}
              {lane.segments.length === 0 ? (
                <span className="conversation-empty">No speech yet</span>
              ) : null}
              <span
                aria-hidden="true"
                className="conversation-marker"
                style={{ left: `${markerLeft}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineSegment({
  durationMs,
  elapsedMs,
  label,
  segment
}: {
  durationMs: number;
  elapsedMs: number;
  label: string;
  segment: ConversationTimelineSegment;
}) {
  const left = (segment.startOffsetMs / durationMs) * 100;
  const width = ((segment.endOffsetMs - segment.startOffsetMs) / durationMs) * 100;
  const active =
    elapsedMs > 0 &&
    segment.startOffsetMs <= elapsedMs &&
    elapsedMs <= segment.endOffsetMs;
  const style = {
    left: `${Math.min(100, left)}%`,
    width: `${Math.max(0, width)}%`
  } satisfies CSSProperties;

  return (
    <span
      aria-label={`${label} speech from ${formatTimelineTime(segment.startOffsetMs)} to ${formatTimelineTime(segment.endOffsetMs)}, ${segment.status}`}
      className={`conversation-segment ${segment.actor} ${segment.status}${active ? " active" : ""}`}
      role="img"
      style={style}
      title={`${label} ${formatTimelineTime(segment.startOffsetMs)}-${formatTimelineTime(segment.endOffsetMs)}`}
    />
  );
}
