import type { VoiceConsoleEvidenceState } from "../../src/features/voice-console/evidence/voiceConsoleEvidence";

export function createVoiceConsoleEvidenceFixture(): VoiceConsoleEvidenceState {
  return {
    status: "ready",
    lastUpdated: "2026-05-14T09:00:00.000Z",
    cost: {
      estimateStatus: "partial",
      flags: ["transcription_usage_not_captured"],
      lineItems: [{
        amountLabel: "$0.0037",
        amountUsd: 0.00366,
        category: "speech_to_speech",
        id: "speech_audio_output",
        label: "Speech response",
        quantityLabel: "40 tokens"
      }, {
        amountLabel: "$0.0009",
        amountUsd: 0.00085,
        category: "input_transcription",
        id: "transcription_audio_duration",
        label: "Transcription audio",
        quantityLabel: "0.050 min"
      }],
      model: "gpt-realtime-2",
      pricingLastVerifiedAt: "2026-05-17",
      sourceEventCount: 2,
      totalLabel: "$0.0045",
      totalUsd: 0.00451,
      transcriptionModel: "gpt-realtime-whisper",
      unavailableReasons: ["transcription usage not captured"]
    },
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
  };
}
