import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applyVoiceConsoleAction,
  createInitialVoiceConsoleState,
  VoiceConsoleView
} from "../src/features/voice-console";
import { toVoiceConsoleEvidenceState } from "../src/features/voice-console/evidence/voiceConsoleEvidence";

describe("CODS-200 live call current audio, speech, and controls", () => {
  it("renders audio, speech, and control states across start, active, and ended", () => {
    const initial = createInitialVoiceConsoleState("10:51:24");
    const initialHtml = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state: initial,
        onAction: () => undefined
      })
    );

    expect(initialHtml.match(/data-speech-slot=/g)).toHaveLength(2);
    expect(initialHtml).toContain("Caller speech will appear here.");
    expect(initialHtml).toContain("MealPlan Agent speech will appear here.");
    expect(initialHtml).toContain("Unavailable");
    expect(initialHtml).toContain("Ready");
    expect(controlButtonCount(initialHtml)).toBe(3);
    expect(controlOrder(initialHtml)).toEqual(["Call", "Mute", "Reset"]);
    expect(initialHtml).toMatch(/<button[^>]*disabled=""/);

    const active = applyVoiceConsoleAction(initial, {
      type: "start",
      at: "10:52:00"
    });
    const activeHtml = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state: active,
        onAction: () => undefined
      })
    );

    expect(controlButtonCount(activeHtml)).toBe(3);
    expect(controlOrder(activeHtml)).toEqual(["Hang up", "Mute", "Reset"]);
    expect(activeHtml).toContain("Speaking");
    expect(activeHtml).toContain("Listening");
    expect(activeHtml).not.toMatch(/cursor-not-allowed/);

    const ended = applyVoiceConsoleAction(active, {
      type: "stop",
      at: "10:52:30"
    });
    const endedHtml = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state: ended,
        onAction: () => undefined
      })
    );

    expect(controlButtonCount(endedHtml)).toBe(3);
    expect(controlOrder(endedHtml)).toEqual(["Call again", "Mute", "Reset"]);
    expect(endedHtml).toMatch(/<button[^>]*disabled=""/);
  });

  it("keeps Live Call speech to the latest two slots instead of full history", () => {
    const state = createInitialVoiceConsoleState("10:51:24");
    const evidence = toVoiceConsoleEvidenceState({
      transcript: [{
        actor: "user",
        created_at: "2026-05-18T09:00:00.000Z",
        evidence_id: "tr_old_user",
        is_operational_source: false,
        text: "Older caller turn that belongs in transcript history.",
        transcript_kind: "realtime_transcript",
        turn_id: "turn_old_user"
      }, {
        actor: "assistant",
        created_at: "2026-05-18T09:00:01.000Z",
        evidence_id: "tr_old_agent",
        is_operational_source: false,
        text: "Older agent turn that belongs in transcript history.",
        transcript_kind: "realtime_transcript",
        turn_id: "turn_old_agent"
      }, {
        actor: "user",
        created_at: "2026-05-18T09:00:02.000Z",
        evidence_id: "tr_latest_user",
        is_operational_source: false,
        text: "Latest caller request.",
        transcript_kind: "realtime_transcript",
        turn_id: "turn_latest_user"
      }, {
        actor: "assistant",
        created_at: "2026-05-18T09:00:03.000Z",
        evidence_id: "tr_latest_agent",
        is_operational_source: false,
        text: "Latest agent response.",
        transcript_kind: "realtime_transcript",
        turn_id: "turn_latest_agent"
      }]
    });

    const liveHtml = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        evidence,
        state,
        onAction: () => undefined
      })
    );
    const transcriptHtml = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        evidence,
        initialTab: "transcript",
        state,
        onAction: () => undefined
      })
    );

    expect(liveHtml.match(/data-speech-slot=/g)).toHaveLength(2);
    expect(liveHtml).toContain("Latest caller request.");
    expect(liveHtml).toContain("Latest agent response.");
    expect(liveHtml).not.toContain("Older caller turn that belongs in transcript history.");
    expect(liveHtml).not.toContain("Older agent turn that belongs in transcript history.");
    expect(transcriptHtml).toContain("Older caller turn that belongs in transcript history.");
    expect(transcriptHtml).toContain("Older agent turn that belongs in transcript history.");
  });
});

function controlButtonCount(html: string): number {
  return controlOrder(html).length;
}

function controlOrder(html: string): string[] {
  const controls = html.slice(html.indexOf("border-t border-gray-100 pt-6"));
  return Array.from(controls.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g))
    .slice(0, 3)
    .map((match) => stripTags(match[1] ?? ""));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
