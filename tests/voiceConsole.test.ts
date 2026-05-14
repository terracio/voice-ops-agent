import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VoiceConsoleView } from "../src/app/VoiceConsole";
import {
  applyVoiceConsoleAction,
  createInitialVoiceConsoleState
} from "../src/app/voiceConsoleController";
import {
  markRealtimeCallId,
  markRealtimeError,
  markRealtimeState,
  markRealtimeStartRequested
} from "../src/app/voiceConsoleRealtimeState";

describe("voice console UI shell", () => {
  it("renders the required operational console regions", () => {
    const state = createInitialVoiceConsoleState("10:51:24");
    const html = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state,
        onAction: () => undefined
      })
    );

    expect(html).toContain("MealPlan VoiceOps");
    expect(html).toContain("Local demo");
    expect(html).toContain("gpt-realtime-2");
    expect(html).toContain("Disconnected");
    expect(html).toContain("Agent");
    expect(html).toContain("Caller");
    expect(html).toContain("Live activity");
    expect(html).toContain("Transcript evidence");
    expect(html).toContain("Tool timeline");
    expect(html).toContain("Call ID");
    expect(html).toContain("Control handoff");
    expect(html).toContain("Server call setup");
    expect(html).toContain("Server-side only");
    expect(html).not.toContain("Audit log");
    expect(html).not.toContain("Before/after diff");
  });

  it("renders transcript and tool timeline from server evidence", () => {
    const state = markRealtimeState(
      markRealtimeCallId(
        markRealtimeStartRequested(createInitialVoiceConsoleState("10:51:24"), "10:52:00"),
        "rtc_test_123456",
        "10:52:01"
      ),
      { at: "10:52:02", previousState: "connecting", state: "listening" }
    );
    const html = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state,
        evidence: {
          status: "ready",
          lastUpdated: "2026-05-14T09:00:00.000Z",
          transcript: [{
            actor: "user",
            at: "09:00:00",
            id: "tr_user_1",
            kind: "realtime_transcript",
            text: "Please make my meals spicy next week.",
            turnId: "turn_user_1"
          }, {
            actor: "assistant",
            at: "09:00:02",
            id: "tr_assistant_1",
            kind: "realtime_transcript",
            text: "I can help with that.",
            turnId: "turn_assistant_1"
          }],
          tools: [{
            at: "09:00:01",
            id: "tool_preview_1",
            input: "{\"change_set_id\":\"cs_001\"}",
            name: "preview_change_set",
            risk: "preview",
            status: "blocked",
            summary: "Customization update requires a preview delta.",
            policyId: "P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA"
          }],
          events: [{
            at: "09:00:01",
            eventType: "response.done",
            id: "evt_1",
            label: "response.done",
            severity: "info"
          }, {
            at: "09:00:02",
            eventType: "error",
            id: "evt_2",
            label: "error: invalid_request_error",
            severity: "error"
          }]
        },
        onAction: () => undefined
      })
    );

    expect(html).toContain("Debug text only");
    expect(html).toContain("Caller transcript");
    expect(html).toContain("Agent transcript");
    expect(html).toContain("Please make my meals spicy next week.");
    expect(html).toContain("I can help with that.");
    expect(html).toContain("preview_change_set");
    expect(html).toContain("Blocked");
    expect(html).toContain("P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA");
    expect(html).toContain("response.done");
    expect(html).toContain("error: invalid_request_error");
    expect(html).not.toContain("completed successfully");
  });

  it("drives visible call state through the mocked controller contract", () => {
    const initial = createInitialVoiceConsoleState("10:51:24");
    const unavailableMute = applyVoiceConsoleAction(initial, {
      type: "toggleMute",
      at: "10:51:30"
    });

    expect(unavailableMute.isMuted).toBe(true);
    expect(unavailableMute.inputLevel).toBe(12);
    expect(unavailableMute.events[0]?.title).toBe("Session not connected");

    const started = applyVoiceConsoleAction(initial, {
      type: "start",
      at: "10:52:00"
    });

    expect(started.sessionStatus).toBe("connected");
    expect(started.agentMode).toBe("listening");
    expect(started.microphonePermission).toBe("granted");
    expect(started.controlHandoff).toBe("attached");
    expect(started.serverCallSetup).toBe("created");
    expect(started.callId).toMatch(/^local-call-/);
    expect(started.events[0]?.title).toBe("Session started");

    const muted = applyVoiceConsoleAction(started, {
      type: "toggleMute",
      at: "10:52:05"
    });

    expect(muted.isMuted).toBe(true);
    expect(muted.inputLevel).toBe(0);
    expect(muted.events[0]?.title).toBe("Caller muted");

    const stopped = applyVoiceConsoleAction(muted, {
      type: "stop",
      at: "10:52:30"
    });

    expect(stopped.sessionStatus).toBe("disconnected");
    expect(stopped.agentMode).toBe("idle");
    expect(stopped.callId).toBeNull();
    expect(stopped.controlHandoff).toBe("pending");
    expect(stopped.events[0]?.title).toBe("Session stopped");
  });

  it("keeps browser code out of server-only domain and tool modules", () => {
    const browserFiles = [
      "src/app/page.tsx",
      "src/app/VoiceConsole.tsx",
      "src/app/voiceConsoleController.ts",
      "src/app/voiceConsoleIcons.tsx",
      "src/app/voiceConsoleLabels.ts",
      "src/app/voiceConsoleRealtimeState.ts",
      "src/app/useVoiceConsoleRealtime.ts",
      "src/app/useRealtimeEvidence.ts",
      "src/app/VoiceEvidencePanels.tsx",
      "src/app/VoiceConsolePrimitives.tsx",
      "src/app/voiceConsoleEvidence.ts",
      "src/app/voiceConsoleTranscript.ts"
    ];

    for (const file of browserFiles) {
      const contents = readFileSync(file, "utf8");
      expect(contents).not.toMatch(/@\/(?:domain|tools|agent|audit)\b/);
      expect(contents).not.toMatch(/\.\.\/(?:domain|tools|agent|audit)\b/);
    }
  });

  it("maps realtime browser controller events into visible console state", () => {
    const initial = createInitialVoiceConsoleState("10:51:24");
    const starting = markRealtimeStartRequested(initial, "10:52:00");
    const callCreated = markRealtimeCallId(
      starting,
      "rtc_test_123",
      "10:52:01"
    );
    const listening = markRealtimeState(callCreated, {
      at: "10:52:02",
      previousState: "connecting",
      state: "listening"
    });

    expect(starting.sessionStatus).toBe("connecting");
    expect(starting.controlHandoff).toBe("pending");
    expect(callCreated.callId).toBe("rtc_test_123");
    expect(callCreated.serverCallSetup).toBe("created");
    expect(listening.sessionStatus).toBe("connected");
    expect(listening.agentMode).toBe("listening");
    expect(listening.microphonePermission).toBe("granted");
    expect(listening.controlHandoff).toBe("attached");
    expect(listening.events[0]?.title).toBe("Session listening");

    const toolRunning = markRealtimeState(listening, {
      at: "10:52:03",
      previousState: "listening",
      state: "tool-running"
    });

    expect(toolRunning.agentMode).toBe("tool-running");
    expect(toolRunning.assistantAudioLabel).toBe("Server tools are running");
  });

  it("deduplicates same-second realtime error events for stable React keys", () => {
    const initial = createInitialVoiceConsoleState("10:51:24");
    const firstError = markRealtimeError(initial, "Session failed", "10:52:00");
    const repeatedError = markRealtimeError(
      firstError,
      "Session failed",
      "10:52:00"
    );
    const ids = repeatedError.events.map((event) => event.id);

    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids.filter((id) => id === "realtime-error-10:52:00")).toHaveLength(1);
  });

  it("shows one actionable microphone permission error", () => {
    const initial = createInitialVoiceConsoleState("10:51:24");
    const genericErrorState = markRealtimeState(initial, {
      at: "10:52:00",
      previousState: "connecting",
      state: "error"
    });
    const detailedError = markRealtimeError(
      genericErrorState,
      "Permission denied",
      "10:52:00"
    );

    expect(genericErrorState.events[0]?.title).not.toBe("Realtime error");
    expect(detailedError.microphonePermission).toBe("denied");
    expect(detailedError.events[0]).toMatchObject({
      detail:
        "Microphone permission was denied by the browser. Allow microphone access for localhost, then click Start again.",
      title: "Realtime session failed"
    });
    expect(
      detailedError.events.some((event) => event.title === "Realtime error")
    ).toBe(false);
  });
});
