import { describe, expect, it } from "vitest";
import {
  appendRealtimeCostUsageEvent,
  createInitialRealtimeCostTelemetry,
  estimateRealtimeCostTelemetry
} from "../src/realtime/config/costTelemetry";

const capturedAt = "2026-05-17T09:00:00.000Z";

describe("Realtime cost telemetry", () => {
  it("estimates speech-to-speech and transcription costs from usage details", () => {
    const estimate = estimateRealtimeCostTelemetry({
      model: "gpt-realtime-2",
      transcriptionModel: "gpt-realtime-whisper",
      rawUsageEvents: [{
        captured_at: capturedAt,
        event_type: "response.done",
        model: "gpt-realtime-2",
        usage: {
          total_tokens: 253,
          input_tokens: 132,
          output_tokens: 121,
          input_token_details: {
            text_tokens: 119,
            audio_tokens: 13,
            cached_tokens: 67,
            cached_tokens_details: {
              text_tokens: 64,
              audio_tokens: 3
            }
          },
          output_token_details: {
            text_tokens: 30,
            audio_tokens: 91
          }
        }
      }, {
        captured_at: capturedAt,
        event_type: "conversation.item.input_audio_transcription.completed",
        model: "gpt-realtime-whisper",
        usage: {
          type: "tokens",
          input_tokens: 600,
          input_token_details: {
            audio_tokens: 600,
            text_tokens: 0
          },
          output_tokens: 20,
          total_tokens: 620
        }
      }]
    });

    expect(estimate.estimate_status).toBe("available");
    expect(estimate.total_usd).toBe(0.0241108);
    expect(estimate.line_items.map((item) => item.code)).toEqual([
      "speech_text_input",
      "speech_audio_input",
      "speech_cached_text_input",
      "speech_cached_audio_input",
      "speech_text_output",
      "speech_audio_output",
      "transcription_audio_duration"
    ]);
    expect(estimate.line_items.find((item) => {
      return item.code === "transcription_audio_duration";
    })).toMatchObject({
      amount_usd: 0.017,
      quantity: 1,
      unit: "minutes"
    });
  });

  it("preserves raw usage but makes unknown speech model estimates unavailable", () => {
    const estimate = estimateRealtimeCostTelemetry({
      model: "gpt-realtime-future",
      transcriptionModel: "gpt-realtime-whisper",
      rawUsageEvents: [{
        captured_at: capturedAt,
        event_type: "response.done",
        model: "gpt-realtime-future",
        usage: {
          input_token_details: { audio_tokens: 10 },
          output_token_details: { audio_tokens: 20 }
        }
      }]
    });

    expect(estimate.estimate_status).toBe("unavailable");
    expect(estimate.total_usd).toBeUndefined();
    expect(estimate.flags).toContain("unknown_speech_model");
    expect(estimate.raw_usage_events[0]?.usage).toMatchObject({
      input_token_details: { audio_tokens: 10 }
    });
  });

  it("marks missing token or duration details as partial instead of zero cost", () => {
    const estimate = estimateRealtimeCostTelemetry({
      model: "gpt-realtime-2",
      transcriptionModel: "gpt-realtime-whisper",
      rawUsageEvents: [{
        captured_at: capturedAt,
        event_type: "response.done",
        model: "gpt-realtime-2",
        usage: {
          input_tokens: 20,
          output_tokens: 30,
          output_token_details: { audio_tokens: 30 }
        }
      }, {
        captured_at: capturedAt,
        event_type: "conversation.item.input_audio_transcription.completed",
        model: "gpt-realtime-whisper",
        usage: { type: "tokens", total_tokens: 10 }
      }]
    });

    expect(estimate.estimate_status).toBe("partial");
    expect(estimate.total_usd).toBe(0.00192);
    expect(estimate.flags).toEqual(expect.arrayContaining([
      "speech_input_breakdown_missing",
      "transcription_audio_tokens_missing"
    ]));
    expect(estimate.line_items).not.toContainEqual(expect.objectContaining({
      code: "transcription_audio_duration",
      amount_usd: 0
    }));
  });

  it("does not price speech input totals when cached token split is missing", () => {
    const estimate = estimateRealtimeCostTelemetry({
      model: "gpt-realtime-2",
      transcriptionModel: "gpt-realtime-whisper",
      rawUsageEvents: [{
        captured_at: capturedAt,
        event_type: "response.done",
        model: "gpt-realtime-2",
        usage: {
          input_token_details: {
            text_tokens: 100,
            audio_tokens: 50,
            cached_tokens: 25
          },
          output_token_details: {
            text_tokens: 10,
            audio_tokens: 20
          }
        }
      }]
    });

    expect(estimate.estimate_status).toBe("partial");
    expect(estimate.flags).toContain("speech_cached_breakdown_missing");
    expect(estimate.line_items.map((item) => item.code)).toEqual([
      "speech_text_output",
      "speech_audio_output"
    ]);
    expect(estimate.total_usd).toBe(0.00152);
  });

  it("captures alternate transcription completion usage events", () => {
    const initial = createInitialRealtimeCostTelemetry({
      model: "gpt-realtime-2",
      transcriptionModel: "gpt-realtime-whisper"
    });
    const ignored = appendRealtimeCostUsageEvent({
      createdAt: capturedAt,
      event: {
        type: "input_audio_transcription.done",
        usage: { input_token_details: { audio_tokens: 600 } }
      },
      telemetry: initial
    });
    const estimate = appendRealtimeCostUsageEvent({
      createdAt: capturedAt,
      event: {
        type: "input_audio_buffer.transcription.completed",
        usage: {
          input_token_details: { audio_tokens: 600 },
          total_tokens: 620
        }
      },
      telemetry: ignored
    });

    expect(ignored.source_event_count).toBe(0);
    expect(estimate.raw_usage_events[0]?.event_type).toBe(
      "input_audio_buffer.transcription.completed"
    );
    expect(estimate.flags).not.toContain("transcription_usage_not_captured");
    expect(estimate.line_items).toContainEqual(expect.objectContaining({
      code: "transcription_audio_duration",
      amount_usd: 0.017
    }));
  });
});
