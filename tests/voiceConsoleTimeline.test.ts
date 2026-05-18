import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VoiceConversationTimeline } from "../src/features/voice-console/components/VoiceConversationTimeline";
import {
  buildConversationTimelineModel,
  formatTimelineTime
} from "../src/features/voice-console/state/voiceConversationTimeline";
import { clockTimeToMs } from "../src/features/voice-console/state/voiceConsoleTiming";
import type { VoiceTranscriptState, VoiceTranscriptTurn } from "../src/features/voice-console/evidence/voiceConsoleTranscript";

describe("conversation timeline", () => {
  it("renders fixed empty caller and agent lanes at initial elapsed time", () => {
    const transcript: VoiceTranscriptState = {
      currentAgentText: "",
      currentCallerText: "",
      history: []
    };
    const html = renderToStaticMarkup(
      React.createElement(VoiceConversationTimeline, {
        callTiming: { nowMs: clockTimeToMs("10:00:00") },
        transcript
      })
    );

    expect(html).toContain("Conversation timeline, elapsed 00:00");
    expect(html).toContain("Caller");
    expect(html).toContain("Agent");
    expect(html.match(/No speech yet/g)).toHaveLength(2);
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

  it("renders bars, time ruler, and current marker for active calls", () => {
    const transcript: VoiceTranscriptState = {
      currentAgentText: "I can help with that.",
      currentCallerText: "Please make my meals spicy next week.",
      history: [
        turn("caller-1", "user", "10:00:02", "Please make my meals spicy next week."),
        turn("agent-1", "assistant", "10:00:05", "I can help with that.")
      ]
    };
    const html = renderToStaticMarkup(
      React.createElement(VoiceConversationTimeline, {
        callTiming: {
          nowMs: clockTimeToMs("10:00:10"),
          startedAtMs: clockTimeToMs("10:00:00")
        },
        transcript
      })
    );

    expect(html).toContain("conversation-ruler");
    expect(html).toContain("conversation-marker");
    expect(html).toContain("conversation-segment caller estimated");
    expect(html).toContain("conversation-segment agent estimated");
    expect(html).toContain("Caller speech from 00:02 to 00:04, estimated");
    expect(html).toContain("Agent speech from 00:05 to 00:06, estimated");
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
    fragmentCount: 1,
    id,
    kind: "realtime_transcript",
    text,
    turnId: id
  };
}
