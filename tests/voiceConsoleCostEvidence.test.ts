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
});
