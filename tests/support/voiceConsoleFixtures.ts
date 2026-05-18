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
    policies: [{
      at: "09:00:04",
      id: "policy_missing_confirmation",
      policyId: "P004_MISSING_CONFIRMATION",
      result: {
        message: "Commit requires explicit confirmation.",
        passed: false,
        policyId: "P004_MISSING_CONFIRMATION",
        severity: "block"
      },
      stage: "commit"
    }],
    changeSets: [{
      at: "09:00:04",
      blockingPolicyIds: ["P004_MISSING_CONFIRMATION"],
      changeSetId: "cs_001",
      customerId: "cus_001",
      expectedStateVersion: 7,
      operations: [{
        field: "spice_level",
        next_value: "spicy",
        previous_value: "normal",
        type: "update_customization"
      }],
      policyResults: [],
      status: "previewed"
    }],
    diffs: [{
      after: "spicy",
      at: "09:00:04",
      before: "normal",
      changeSetId: "cs_001",
      customerId: "cus_001",
      diffKind: "customization",
      field: "spice_level",
      status: "proposed"
    }],
    confirmations: [{
      at: "09:00:06",
      changeSetId: "cs_001",
      customerId: "cus_001",
      id: "confirmation_missing",
      reason: "Explicit confirmation has not been captured.",
      status: "missing"
    }],
    auditEvents: [{
      actor: "policy",
      at: "09:00:05",
      changeSetId: "cs_001",
      customerId: "cus_001",
      eventId: "audit_1",
      eventType: "policy_block",
      id: "audit_1",
      policyId: "P004_MISSING_CONFIRMATION",
      summary: "policy_block via commit_change_set for cs_001",
      toolName: "commit_change_set"
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
