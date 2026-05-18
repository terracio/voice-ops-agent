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
    expect(html).not.toContain("Ops Team");
    expect(html).toContain("Live Call");
    expect(html).toContain("Transcript");
    expect(html).toContain("Evidence");
    expect(html).toContain("Trace");
    expect(html).toContain("aria-selected=\"true\"");
    expect(html).toContain("Disconnected");
    expect(html).toContain("Call metrics");
    expect(html).toContain("Elapsed");
    expect(html).toContain("Est. cost");
    expect(html).not.toContain("Secure transport");
    expect(html).not.toContain("Encrypted in transit");
    expect(html).not.toContain("End-to-end encrypted");
    expect(html).toContain("aria-label=\"Current audio status\"");
    expect(html).not.toContain(">Current Audio Status<");
    expect(html).toContain("Conversation Timeline");
    expect(html).toContain("Current Speech");
    expect(html).toContain("aria-label=\"Agent action and safety\"");
    expect(html).not.toContain("Agent Action / Safety");
    expect(html).toContain("Unknown Customer");
    expect(html).toContain("Tool timeline");
    expect(html).toContain("0 tool calls");
    expect(html).toContain("No tool calls yet.");
    expect(html).toContain("Initial session events only.");
    expect(html).toContain("Policy summary");
    expect(html).not.toContain("Tool and policy summary");
    expect(html).toContain("Call");
    expect(html).toContain("Mute");
    expect(html).toContain("Reset");
    expect(html).not.toContain("Hang up");
    expect(html).not.toContain("Start session");
    expect(html).not.toContain("Stop session");
    expect(html).not.toContain("Transcript evidence");
    expect(html).not.toContain("Debug text only");
    expect(html).not.toContain("Input {");
    expect(html).not.toContain("Output {");
    expect(html).not.toContain("Live activity");
    expect(html).not.toContain("Audit log");
    expect(html).not.toContain("Before/after diff");
    expect(html).toContain("Waiting for call to start.");
    expect(html).toContain("Private reads &amp; writes blocked");
    expect(html).toContain("Private reads and writes require confirmed identity.");
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

    expect(transcriptHtml).toContain("Diagnostic transcript only");
    expect(transcriptHtml).toContain("Transcript history");
    expect(transcriptHtml).toContain("Please make my meals spicy next week.");
    expect(transcriptHtml).toContain("I can help with that.");
    expect(evidenceHtml).toContain("Operational evidence");
    expect(evidenceHtml).toContain("Tool timeline");
    expect(evidenceHtml).toContain("preview_change_set");
    expect(evidenceHtml).toContain("Blocked");
    expect(evidenceHtml).toContain("P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA");
    expect(evidenceHtml).toContain("Policies");
    expect(evidenceHtml).toContain("P004_MISSING_CONFIRMATION");
    expect(evidenceHtml).toContain("ChangeSets and diffs");
    expect(evidenceHtml).toContain("cs_001");
    expect(evidenceHtml).toContain("Confirmations and audit");
    expect(evidenceHtml).toContain("policy_block");
    expect(evidenceHtml).not.toContain("Estimated cost");
    expect(evidenceHtml).not.toContain("response.done");
    expect(evidenceHtml).not.toContain("completed successfully");
  });

  it("renders trace diagnostics without mixing them into the Live Call tab", () => {
    const state = createInitialVoiceConsoleState("10:51:24");
    const evidence = createVoiceConsoleEvidenceFixture();
    const html = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state,
        evidence,
        initialTab: "trace",
        onAction: () => undefined
      })
    );

    expect(html).toContain("Live activity");
    expect(html).toContain("Call ID");
    expect(html).toContain("Control handoff");
    expect(html).toContain("Server call setup");
    expect(html).toContain("Server-side only");
    expect(html).toContain("Realtime events");
    expect(html).toContain("response.done");
    expect(html).toContain("error: invalid_request_error");
    expect(html).toContain("Cost telemetry");
    expect(html).toContain("$0.0045");
    expect(html).toContain("gpt-realtime-whisper");
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

  it("renders precise non-zero cost labels in Live Call metrics", () => {
    const state = createInitialVoiceConsoleState("10:51:24");
    const evidence = toVoiceConsoleEvidenceState({
      generated_at: "2026-05-14T09:00:00.000Z",
      cost_telemetry: {
        estimate_status: "available",
        flags: [],
        line_items: [],
        model: "gpt-realtime-2",
        pricing_last_verified_at: "2026-05-17",
        source_event_count: 1,
        total_usd: 0.0045,
        transcription_model: "gpt-realtime-whisper",
        unavailable_reasons: []
      }
    });

    const html = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        evidence,
        state,
        onAction: () => undefined
      })
    );

    expect(html).toContain("$0.0045");
    expect(html).not.toMatch(/>\$0\.00<\/span><span[^>]*>Est\. cost/);
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
      "src/features/voice-console/components/AgentVoiceMark.tsx",
      "src/features/voice-console/components/AgentActionBanner.tsx",
      "src/features/voice-console/components/CallControls.tsx",
      "src/features/voice-console/components/CallMetrics.tsx",
      "src/features/voice-console/components/ChangeSetPreview.tsx",
      "src/features/voice-console/components/ConversationTimeline.tsx",
      "src/features/voice-console/components/CurrentAudioStatus.tsx",
      "src/features/voice-console/components/CurrentSpeech.tsx",
      "src/features/voice-console/components/CustomerSummary.tsx",
      "src/features/voice-console/components/HeaderStatus.tsx",
      "src/features/voice-console/components/LiveCallView.tsx",
      "src/features/voice-console/components/PolicySummary.tsx",
      "src/features/voice-console/components/ToolTimeline.tsx",
      "src/features/voice-console/components/VoiceConsole.tsx",
      "src/features/voice-console/components/VoiceConsolePrimitives.tsx",
      "src/features/voice-console/components/VoiceConsoleTracePanel.tsx",
      "src/features/voice-console/components/VoiceEvidencePanels.tsx",
      "src/features/voice-console/components/voiceConsoleIcons.tsx",
      "src/features/voice-console/evidence/voiceConsoleEvidence.ts",
      "src/features/voice-console/evidence/voiceConsoleLabels.ts",
      "src/features/voice-console/evidence/voiceConsoleStructuredEvidence.ts",
      "src/features/voice-console/evidence/voiceConsoleTranscript.ts",
      "src/features/voice-console/hooks/useRealtimeEvidence.ts",
      "src/features/voice-console/hooks/useVoiceConsoleRealtime.ts",
      "src/features/voice-console/models/liveCallViewModel.ts",
      "src/features/voice-console/state/voiceConversationTimeline.ts",
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
    const errorHtml = renderToStaticMarkup(
      React.createElement(VoiceConsoleView, {
        state: detailedError,
        onAction: () => undefined
      })
    );
    expect(errorHtml).toContain("Realtime session failed");
    expect(errorHtml).toContain("Realtime error");
    expect(errorHtml).toContain(
      "Microphone permission was denied by the browser. Allow microphone access for localhost, then click Call again."
    );
    expect(errorHtml).not.toContain("Waiting for call to start.");
    expect(
      detailedError.events.some((event) => event.title === "Realtime error")
    ).toBe(false);
  });
});
