import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationTimeline } from "../src/features/voice-console/components/ConversationTimeline";
import { toVoiceConsoleEvidenceState } from "../src/features/voice-console/evidence/voiceConsoleEvidence";
import { buildVoiceTranscriptState } from "../src/features/voice-console/evidence/voiceConsoleTranscript";
import {
  buildConversationTimelineModel,
  formatTimelineTime
} from "../src/features/voice-console/state/voiceConversationTimeline";
import { clockTimeToMs } from "../src/features/voice-console/state/voiceConsoleTiming";
import type { VoiceTranscriptTurn } from "../src/features/voice-console/evidence/voiceConsoleTranscript";

describe("conversation timeline", () => {
  it("renders fixed empty caller and agent lanes at initial elapsed time", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConversationTimeline, {
        elapsedLabel: "00:00",
        timeline: { agentSegments: [], callerSegments: [] }
      })
    );

    expect(html).toContain("Conversation Timeline");
    expect(html).toContain("Approximate timeline");
    expect(html).toContain("Caller");
    expect(html).toContain("Agent");
    expect(html).toContain("Silent / thinking / tools");
    expect(html).toContain("00:00");
  });

  it("derives estimated caller and agent speech offsets from transcript timestamps", () => {
    const model = buildConversationTimelineModel({
      callStartedAtMs: clockTimeToMs("10:00:00"),
      elapsedMs: 10_000,
      turns: [
        turn("caller-1", "user", "10:00:02", "Please make my meals spicy next week."),
        turn("agent-1", "assistant", "10:00:05", "I can help with that.")
      ]
    });

    expect(model.elapsedMs).toBe(10_000);
    expect(model.lanes[0]).toMatchObject({ actor: "caller", label: "Caller" });
    expect(model.lanes[1]).toMatchObject({ actor: "agent", label: "Agent" });
    expect(model.lanes[0]?.segments[0]).toMatchObject({
      actor: "caller",
      endOffsetMs: 4_520,
      startOffsetMs: 2_000,
      status: "estimated"
    });
    expect(model.lanes[1]?.segments[0]).toMatchObject({
      actor: "agent",
      endOffsetMs: 6_800,
      startOffsetMs: 5_000,
      status: "estimated"
    });
  });

  it("clamps estimated live speech to the elapsed call duration", () => {
    const model = buildConversationTimelineModel({
      callStartedAtMs: clockTimeToMs("10:00:00"),
      elapsedMs: 9_000,
      turns: [
        turn("caller-1", "user", "10:00:08", "This segment is still going as the marker reaches now.")
      ]
    });

    expect(model.lanes[0]?.segments[0]).toMatchObject({
      endOffsetMs: 9_000,
      startOffsetMs: 8_000,
      status: "live"
    });
  });

  it("uses raw transcript evidence timestamps instead of display labels for epoch call timing", () => {
    const callStartedAtMs = Date.parse("2026-05-18T09:00:00.000Z");
    const evidence = toVoiceConsoleEvidenceState({
      transcript: [{
        actor: "user",
        created_at: "2026-05-18T09:00:30.000Z",
        evidence_id: "tr_user_30s",
        is_operational_source: false,
        text: "I need to pause next week.",
        transcript_kind: "realtime_transcript",
        turn_id: "turn_user_30s"
      }]
    });
    const transcript = buildVoiceTranscriptState(evidence.transcript);
    const model = buildConversationTimelineModel({
      callStartedAtMs,
      elapsedMs: 45_000,
      turns: transcript.history
    });

    expect(evidence.transcript[0]?.at).not.toBe("2026-05-18T09:00:30.000Z");
    expect(transcript.history[0]?.createdAtMs).toBe(callStartedAtMs + 30_000);
    expect(model.lanes[0]?.segments[0]?.startOffsetMs).toBe(30_000);
    expect(model.lanes[0]?.segments[0]?.startOffsetMs).not.toBe(0);
  });

  it("renders bars, time ruler, and current marker for active calls", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConversationTimeline, {
        elapsedLabel: "00:10",
        timeline: {
          agentSegments: [{ startPct: 50, widthPct: 18 }],
          callerSegments: [{ startPct: 20, widthPct: 25 }]
        }
      })
    );

    expect(html).toContain("Caller speaking");
    expect(html).toContain("Agent speaking");
    expect(html).toContain("00:10");
    expect(html).toContain("bg-green-500");
    expect(html).toContain("bg-blue-500");
    expect(html).toContain("left:20%;width:25%");
    expect(html).toContain("left:50%;width:18%");
  });

  it("formats elapsed labels with minute and second precision", () => {
    expect(formatTimelineTime(0)).toBe("00:00");
    expect(formatTimelineTime(65_900)).toBe("01:05");
  });
});

function turn(
  id: string,
  actor: VoiceTranscriptTurn["actor"],
  at: string,
  text: string
): VoiceTranscriptTurn {
  return {
    actor,
    at,
    createdAtMs: undefined,
    fragmentCount: 1,
    id,
    kind: "realtime_transcript",
    text,
    turnId: id
  };
}
