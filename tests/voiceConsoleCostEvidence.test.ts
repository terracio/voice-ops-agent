import { describe, expect, it } from "vitest";
import { toVoiceConsoleEvidenceState } from "../src/features/voice-console/evidence/voiceConsoleEvidence";

describe("voice console cost evidence", () => {
  it("maps duplicate cost line item codes to stable unique UI IDs", () => {
    const evidence = toVoiceConsoleEvidenceState({
      generated_at: "2026-05-14T09:00:00.000Z",
      cost_telemetry: {
        estimate_status: "available",
        flags: [],
        line_items: [{
          amount_usd: 0.001,
          category: "speech_to_speech",
          code: "speech_audio_output",
          label: "Audio output",
          quantity: 10,
          unit: "tokens"
        }, {
          amount_usd: 0.002,
          category: "speech_to_speech",
          code: "speech_audio_output",
          label: "Audio output",
          quantity: 20,
          unit: "tokens"
        }],
        model: "gpt-realtime-2",
        pricing_last_verified_at: "2026-05-17",
        source_event_count: 2,
        total_usd: 0.003,
        transcription_model: "gpt-realtime-whisper",
        unavailable_reasons: []
      }
    });

    expect(evidence.cost?.lineItems.map((item) => item.id)).toEqual([
      "speech_audio_output-0",
      "speech_audio_output-1"
    ]);
  });

  it("maps structured evidence metadata for secondary tabs", () => {
    const evidence = toVoiceConsoleEvidenceState({
      audit_events: [{
        audit_event: {
          actor: "policy",
          change_set_id: "cs_001",
          details: {},
          event_id: "audit_1",
          event_type: "policy_block",
          run_id: "run_1",
          timestamp: "2026-05-14T09:00:04.000Z",
          tool_name: "commit_change_set"
        },
        created_at: "2026-05-14T09:00:04.000Z",
        evidence_id: "audit_1",
        source: {
          audit_event_id: "audit_1",
          change_set_id: "cs_001",
          policy_id: "P004_MISSING_CONFIRMATION"
        }
      }],
      call_id: "rtc_test_123456",
      confirmations: [{
        change_set_id: "cs_001",
        created_at: "2026-05-14T09:00:05.000Z",
        customer_id: "cus_001",
        evidence_id: "conf_missing",
        reason: "No explicit confirmation captured.",
        source: { change_set_id: "cs_001" },
        status: "missing"
      }],
      generated_at: "2026-05-14T09:00:06.000Z",
      limitations: [{
        code: "sample_limit",
        message: "Sample limitation.",
        severity: "warning"
      }],
      run_id: "run_1",
      schema_version: "realtime_evidence.v1",
      status: "active"
    });

    expect(evidence).toMatchObject({
      auditEvents: [expect.objectContaining({
        eventType: "policy_block",
        policyId: "P004_MISSING_CONFIRMATION",
        toolName: "commit_change_set"
      })],
      callId: "rtc_test_123456",
      confirmations: [expect.objectContaining({
        changeSetId: "cs_001",
        reason: "No explicit confirmation captured.",
        status: "missing"
      })],
      limitations: [expect.objectContaining({ code: "sample_limit" })],
      runId: "run_1",
      schemaVersion: "realtime_evidence.v1",
      snapshotStatus: "active"
    });
  });
});
