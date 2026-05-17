import { z } from "zod";

export const REALTIME_PRICING_VERSION = "openai-realtime-pricing.2026-05-17";

export const REALTIME_PRICING = {
  currency: "USD",
  last_verified_at: "2026-05-17",
  source_urls: [
    "https://developers.openai.com/api/docs/guides/realtime-costs",
    "https://developers.openai.com/api/docs/models/gpt-realtime-2",
    "https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/"
  ],
  models: {
    "gpt-realtime-2": {
      speech_to_speech: {
        text_input_usd_per_million: 4,
        cached_text_input_usd_per_million: 0.4,
        text_output_usd_per_million: 24,
        audio_input_usd_per_million: 32,
        cached_audio_input_usd_per_million: 0.4,
        audio_output_usd_per_million: 64
      }
    },
    "gpt-realtime-whisper": {
      transcription: {
        usd_per_minute: 0.017,
        seconds_per_audio_token: 0.1
      }
    }
  }
} as const;

const RawUsageEventTypeSchema = z.enum([
  "response.done",
  "conversation.item.input_audio_transcription.completed",
  "input_audio_buffer.transcription.completed",
  "input_audio_transcription.completed"
]);

export const RealtimeCostUsageSourceEventSchema = z.object({
  captured_at: z.string().datetime(),
  event_type: RawUsageEventTypeSchema,
  model: z.string().min(1),
  source_event_id: z.string().min(1).optional(),
  usage: z.unknown().nullable()
}).strict();

export const RealtimeCostLineItemSchema = z.object({
  amount_usd: z.number().nonnegative(),
  category: z.enum(["speech_to_speech", "input_transcription"]),
  code: z.string().min(1),
  label: z.string().min(1),
  model: z.string().min(1),
  quantity: z.number().nonnegative(),
  rate_usd: z.number().nonnegative(),
  rate_unit: z.enum(["million_tokens", "minute"]),
  source_event_count: z.number().int().nonnegative(),
  unit: z.enum(["tokens", "minutes"])
}).strict();

export const RealtimeCostTelemetrySchema = z.object({
  currency: z.literal("USD"),
  estimate_status: z.enum(["available", "partial", "unavailable"]),
  flags: z.array(z.string().min(1)).default([]),
  incomplete: z.boolean(),
  line_items: z.array(RealtimeCostLineItemSchema).default([]),
  model: z.string().min(1),
  pricing_last_verified_at: z.literal("2026-05-17"),
  pricing_source_urls: z.array(z.string().url()).default([]),
  pricing_version: z.literal(REALTIME_PRICING_VERSION),
  raw_usage_events: z.array(RealtimeCostUsageSourceEventSchema).default([]),
  source_event_count: z.number().int().nonnegative(),
  total_usd: z.number().nonnegative().optional(),
  transcription_model: z.string().min(1),
  unavailable_reasons: z.array(z.string().min(1)).default([])
}).strict();

export type RealtimeCostTelemetry = z.infer<typeof RealtimeCostTelemetrySchema>;
export type RealtimeCostUsageSourceEvent = z.infer<
  typeof RealtimeCostUsageSourceEventSchema
>;
