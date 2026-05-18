import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applyVoiceConsoleAction,
  createInitialVoiceConsoleState,
  VoiceConsoleView
} from "../src/features/voice-console";
import {
  markRealtimeCallId,
  markRealtimeError,
  markRealtimeGreetingRequested,
  markRealtimeState,
  markRealtimeStartRequested
} from "../src/features/voice-console/state/voiceConsoleRealtimeState";
import { toVoiceConsoleEvidenceState } from "../src/features/voice-console/evidence/voiceConsoleEvidence";
import { createVoiceConsoleEvidenceFixture } from "./support/voiceConsoleFixtures";

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
    expect(html).toContain("Live Call");
    expect(html).toContain("Transcript");
    expect(html).toContain("Evidence");
    expect(html).toContain("Trace");
    expect(html).toContain("aria-selected=\"true\"");
    expect(html).toContain("Local demo");
    expect(html).toContain("gpt-realtime-2");
    expect(html).toContain("Disconnected");
    expect(html).toContain("Call metrics");
    expect(html).toContain("Current audio");
    expect(html).toContain("Conversation timeline");
    expect(html).toContain("Current speech");
    expect(html).toContain("Agent action");
    expect(html).toContain("Customer summary");
    expect(html).toContain("ChangeSet preview");
    expect(html).toContain("Tool timeline");
    expect(html).toContain("Policy summary");
    expect(html).not.toContain("Tool and policy summary");
    expect(html).toContain("Call");
    expect(html).toContain("Mute");
    expect(html).toContain("Reset");
    expect(html).not.toContain("Hang up");
    expect(html).not.toContain("Start session");
    expect(html).not.toContain("Stop session");
    expect(html).toContain("Server-side only");
    expect(html).not.toContain("Transcript evidence");
    expect(html).not.toContain("Debug text only");
    expect(html).not.toContain("Input {");
    expect(html).not.toContain("Output {");
    expect(html).not.toContain("Live activity");
    expect(html).not.toContain("Audit log");
    expect(html).not.toContain("Before/after diff");
    expect(html).toContain("Ready to start call");
    expect(html).toContain("No customer identified");
    expect(html).toContain("Private reads and writes blocked");
    expect(html).toContain("No pending ChangeSet preview");
    expect(html).toContain("Identity policy active");
  });

  it("renders transcript and evidence tabs from server evidence", () => {
    const state = markRealtimeState(
      markRealtimeCallId(
        markRealtimeStartRequested(createInitialVoiceConsoleState("10:51:24"), "10:52:00"),
        "rtc_test_123456",
        "10:52:01"
      ),
      { at: "10:52:02", previousState: "connecting", state: "listening" }
    );
    const evidence = createVoiceConsoleEvidenceFixture();
    const transcriptHtml = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state,
        evidence,
        initialTab: "transcript",
        onAction: () => undefined
      })
    );
    const evidenceHtml = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state,
        evidence,
        initialTab: "evidence",
        onAction: () => undefined
      })
    );

    expect(transcriptHtml).toContain("Debug text only");
    expect(transcriptHtml).toContain("Transcript evidence");
    expect(transcriptHtml).toContain("Please make my meals spicy next week.");
    expect(transcriptHtml).toContain("I can help with that.");
    expect(evidenceHtml).toContain("Tool timeline");
    expect(evidenceHtml).toContain("preview_change_set");
    expect(evidenceHtml).toContain("Blocked");
    expect(evidenceHtml).toContain("P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA");
    expect(evidenceHtml).toContain("Estimated cost");
    expect(evidenceHtml).toContain("$0.0045");
    expect(evidenceHtml).toContain("Partial local estimate");
    expect(evidenceHtml).toContain("gpt-realtime-whisper");
    expect(evidenceHtml).toContain("Transcription audio");
    expect(evidenceHtml).toContain("response.done");
    expect(evidenceHtml).toContain("error: invalid_request_error");
    expect(evidenceHtml).not.toContain("completed successfully");
  });

  it("renders trace diagnostics without mixing them into the Live Call tab", () => {
    const state = createInitialVoiceConsoleState("10:51:24");
    const html = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state,
        initialTab: "trace",
        onAction: () => undefined
      })
    );

    expect(html).toContain("Live activity");
    expect(html).toContain("Call ID");
    expect(html).toContain("Control handoff");
    expect(html).toContain("Server call setup");
    expect(html).toContain("Server-side only");
  });

  it("maps unavailable cost telemetry without fabricating a zero total", () => {
    const evidence = toVoiceConsoleEvidenceState({
      generated_at: "2026-05-14T09:00:00.000Z",
      cost_telemetry: {
        estimate_status: "unavailable",
        flags: ["unknown_speech_model"],
        line_items: [],
        model: "gpt-realtime-future",
        pricing_last_verified_at: "2026-05-17",
        source_event_count: 1,
        transcription_model: "gpt-realtime-whisper",
        unavailable_reasons: [
          "No frozen pricing is configured for the active Realtime model."
        ]
      }
    });

    expect(evidence.cost).toMatchObject({
      estimateStatus: "unavailable",
      model: "gpt-realtime-future",
      totalLabel: undefined
    });
    expect(evidence.cost?.unavailableReasons[0]).toContain("No frozen pricing");
  });

  it("drives visible call state through the mocked controller contract", () => {
    const initial = createInitialVoiceConsoleState("10:51:24");
    const unavailableMute = applyVoiceConsoleAction(initial, {
      type: "toggleMute",
      at: "10:51:30"
    });

    expect(unavailableMute.isMuted).toBe(true);
    expect(unavailableMute.inputLevel).toBe(12);
    expect(unavailableMute.events[0]?.title).toBe("Call not connected");

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
    expect(started.events[0]?.title).toBe("Call connected");

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
    expect(stopped.callId).toBe(started.callId);
    expect(stopped.controlHandoff).toBe("pending");
    expect(stopped.events[0]?.title).toBe("Hang-up complete");
    expect(stopped.events[0]?.detail).toBe(
      "Audio stopped; transcript and evidence remain until reset"
    );

    const reset = applyVoiceConsoleAction(stopped, {
      type: "reset",
      at: "10:53:00"
    });
    expect(reset.callId).toBeNull();
    expect(reset.events[0]?.title).toBe("Console reset");
  });

  it("keeps browser code out of server-only domain and tool modules", () => {
    const browserFiles = [
      "src/app/page.tsx",
      "src/features/voice-console/components/VoiceConsole.tsx",
      "src/features/voice-console/components/VoiceAgentSafetyPanel.tsx",
      "src/features/voice-console/components/VoiceConsoleLiveCall.tsx",
      "src/features/voice-console/components/VoiceConsolePrimitives.tsx",
      "src/features/voice-console/components/VoiceEvidencePanels.tsx",
      "src/features/voice-console/components/voiceConsoleIcons.tsx",
      "src/features/voice-console/evidence/voiceConsoleEvidence.ts",
      "src/features/voice-console/evidence/voiceConsoleLabels.ts",
      "src/features/voice-console/evidence/voiceConsoleTranscript.ts",
      "src/features/voice-console/hooks/useRealtimeEvidence.ts",
      "src/features/voice-console/hooks/useVoiceConsoleRealtime.ts",
      "src/features/voice-console/state/voiceConsoleController.ts",
      "src/features/voice-console/state/voiceConsoleRealtimeState.ts",
      "src/realtime/browser/ringback.ts"
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
    expect(starting.assistantAudioLabel).toBe("Ringing MealPlan");
    expect(starting.events[0]?.title).toBe("Call requested");
    expect(starting.controlHandoff).toBe("pending");
    expect(callCreated.callId).toBe("rtc_test_123");
    expect(callCreated.serverCallSetup).toBe("created");
    const greetingRequested = markRealtimeGreetingRequested(
      callCreated,
      "10:52:01"
    );
    expect(greetingRequested.events[0]?.title).toBe("Initial greeting requested");
    expect(listening.sessionStatus).toBe("connected");
    expect(listening.agentMode).toBe("listening");
    expect(listening.microphonePermission).toBe("granted");
    expect(listening.controlHandoff).toBe("attached");
    expect(listening.assistantAudioLabel).toBe("Agent ready for caller audio");
    expect(listening.events[0]?.title).toBe("Call connected");

    const toolRunning = markRealtimeState(listening, {
      at: "10:52:03",
      previousState: "listening",
      state: "tool-running"
    });

    expect(toolRunning.agentMode).toBe("tool-running");
    expect(toolRunning.assistantAudioLabel).toBe("Server tools are running");

    const ended = markRealtimeState(toolRunning, {
      at: "10:52:04",
      previousState: "tool-running",
      state: "ended"
    });

    expect(ended.sessionStatus).toBe("disconnected");
    expect(ended.callId).toBe("rtc_test_123");
    expect(ended.events[0]?.title).toBe("Call ended");
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
        "Microphone permission was denied by the browser. Allow microphone access for localhost, then click Call again.",
      title: "Realtime session failed"
    });
    expect(
      detailedError.events.some((event) => event.title === "Realtime error")
    ).toBe(false);
  });
});
