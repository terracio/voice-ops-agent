import { z } from "zod";
import {
  REALTIME_PRICING,
  REALTIME_PRICING_VERSION,
  RealtimeCostLineItemSchema,
  RealtimeCostTelemetrySchema,
  RealtimeCostUsageSourceEventSchema,
  type RealtimeCostTelemetry,
  type RealtimeCostUsageSourceEvent
} from "./pricing";

type SpeechRates =
  typeof REALTIME_PRICING.models["gpt-realtime-2"]["speech_to_speech"];
type TranscriptionRates =
  typeof REALTIME_PRICING.models["gpt-realtime-whisper"]["transcription"];
type CostLineItem = z.infer<typeof RealtimeCostLineItemSchema>;

export function createInitialRealtimeCostTelemetry(options: {
  model?: string;
  transcriptionModel?: string;
} = {}): RealtimeCostTelemetry {
  return estimateRealtimeCostTelemetry({
    model: nonEmptyString(options.model) ??
      nonEmptyString(process.env.OPENAI_REALTIME_MODEL) ??
      "gpt-realtime-2",
    rawUsageEvents: [],
    transcriptionModel: nonEmptyString(options.transcriptionModel) ??
      "gpt-realtime-whisper"
  });
}

export function appendRealtimeCostUsageEvent(options: {
  createdAt: string;
  event: unknown;
  telemetry: RealtimeCostTelemetry;
}): RealtimeCostTelemetry {
  const usageEvent = costUsageSourceEventFromRealtimeEvent({
    createdAt: options.createdAt,
    event: options.event,
    speechModel: options.telemetry.model,
    transcriptionModel: options.telemetry.transcription_model
  });
  if (!usageEvent) return options.telemetry;
  return estimateRealtimeCostTelemetry({
    model: usageEvent.event_type === "response.done"
      ? usageEvent.model
      : options.telemetry.model,
    rawUsageEvents: [...options.telemetry.raw_usage_events, usageEvent],
    transcriptionModel: usageEvent.event_type ===
      "conversation.item.input_audio_transcription.completed"
      ? usageEvent.model
      : options.telemetry.transcription_model
  });
}

export function estimateRealtimeCostTelemetry(options: {
  model: string;
  rawUsageEvents: RealtimeCostUsageSourceEvent[];
  transcriptionModel: string;
}): RealtimeCostTelemetry {
  const rawUsageEvents = RealtimeCostUsageSourceEventSchema.array().parse(
    options.rawUsageEvents
  );
  const flags = new Set<string>();
  const lineItems: CostLineItem[] = [];
  const speechRates = speechPricing(options.model);
  const transcriptionRates = transcriptionPricing(options.transcriptionModel);
  const responseEvents = rawUsageEvents.filter((event) => {
    return event.event_type === "response.done";
  });
  const transcriptionEvents = rawUsageEvents.filter((event) => {
    return event.event_type ===
      "conversation.item.input_audio_transcription.completed";
  });

  if (!speechRates) flags.add("unknown_speech_model");
  if (!transcriptionRates) flags.add("unknown_transcription_model");
  if (speechRates) {
    responseEvents.forEach((event) => {
      lineItems.push(...speechLineItems(event, speechRates, flags));
    });
  }
  if (transcriptionRates) {
    transcriptionEvents.forEach((event) => {
      lineItems.push(...transcriptionLineItems(event, transcriptionRates, flags));
    });
  }
  if (rawUsageEvents.length > 0 && responseEvents.length === 0) {
    flags.add("speech_usage_not_captured");
  }
  if (rawUsageEvents.length > 0 && transcriptionEvents.length === 0) {
    flags.add("transcription_usage_not_captured");
  }

  const total = roundUsd(
    lineItems.reduce((sum, item) => sum + item.amount_usd, 0)
  );
  const unavailable = !speechRates || rawUsageEvents.length === 0 ||
    lineItems.length === 0;
  return RealtimeCostTelemetrySchema.parse({
    currency: REALTIME_PRICING.currency,
    estimate_status: unavailable
      ? "unavailable"
      : flags.size > 0 ? "partial" : "available",
    flags: [...flags],
    incomplete: flags.size > 0,
    line_items: lineItems,
    model: options.model,
    pricing_last_verified_at: REALTIME_PRICING.last_verified_at,
    pricing_source_urls: REALTIME_PRICING.source_urls,
    pricing_version: REALTIME_PRICING_VERSION,
    raw_usage_events: rawUsageEvents,
    source_event_count: rawUsageEvents.length,
    total_usd: unavailable ? undefined : total,
    transcription_model: options.transcriptionModel,
    unavailable_reasons: unavailableReasonsFor(flags, lineItems)
  });
}

function speechLineItems(
  event: RealtimeCostUsageSourceEvent,
  rates: SpeechRates,
  flags: Set<string>
): CostLineItem[] {
  const usage = recordValue(event.usage);
  if (!usage) {
    flags.add("speech_usage_missing");
    return [];
  }
  const input = recordValue(usage.input_token_details);
  const output = recordValue(usage.output_token_details);
  const items: CostLineItem[] = [];

  if (input) {
    const cached = cachedInputTokens(input, flags);
    addTokenItem(items, event, "speech_to_speech", {
      code: "speech_text_input",
      label: "Text input",
      rate: rates.text_input_usd_per_million,
      tokens: uncachedTokens(input.text_tokens, cached.text)
    });
    addTokenItem(items, event, "speech_to_speech", {
      code: "speech_audio_input",
      label: "Audio input",
      rate: rates.audio_input_usd_per_million,
      tokens: uncachedTokens(input.audio_tokens, cached.audio)
    });
    addTokenItem(items, event, "speech_to_speech", {
      code: "speech_cached_text_input",
      label: "Cached text input",
      rate: rates.cached_text_input_usd_per_million,
      tokens: cached.text
    });
    addTokenItem(items, event, "speech_to_speech", {
      code: "speech_cached_audio_input",
      label: "Cached audio input",
      rate: rates.cached_audio_input_usd_per_million,
      tokens: cached.audio
    });
    if (positiveNumber(input.image_tokens)) flags.add("speech_image_tokens_unpriced");
  } else if (positiveNumber(usage.input_tokens)) {
    flags.add("speech_input_breakdown_missing");
  }

  if (output) {
    addTokenItem(items, event, "speech_to_speech", {
      code: "speech_text_output",
      label: "Text output",
      rate: rates.text_output_usd_per_million,
      tokens: numberValue(output.text_tokens)
    });
    addTokenItem(items, event, "speech_to_speech", {
      code: "speech_audio_output",
      label: "Audio output",
      rate: rates.audio_output_usd_per_million,
      tokens: numberValue(output.audio_tokens)
    });
  } else if (positiveNumber(usage.output_tokens)) {
    flags.add("speech_output_breakdown_missing");
  }
  return items;
}

function transcriptionLineItems(
  event: RealtimeCostUsageSourceEvent,
  rates: TranscriptionRates,
  flags: Set<string>
): CostLineItem[] {
  const usage = recordValue(event.usage);
  const input = recordValue(usage?.input_token_details);
  const audioTokens = numberValue(input?.audio_tokens);
  if (!usage) flags.add("transcription_usage_missing");
  if (audioTokens === undefined) {
    flags.add("transcription_audio_tokens_missing");
    return [];
  }
  const minutes = roundQuantity(audioTokens * rates.seconds_per_audio_token / 60);
  return [RealtimeCostLineItemSchema.parse({
    amount_usd: roundUsd(minutes * rates.usd_per_minute),
    category: "input_transcription",
    code: "transcription_audio_duration",
    label: "Transcription audio",
    model: event.model,
    quantity: minutes,
    rate_usd: rates.usd_per_minute,
    rate_unit: "minute",
    source_event_count: 1,
    unit: "minutes"
  })];
}

function cachedInputTokens(input: Record<string, unknown>, flags: Set<string>) {
  const details = recordValue(input.cached_tokens_details);
  if (!details) {
    if (positiveNumber(input.cached_tokens)) {
      flags.add("speech_cached_breakdown_missing");
    }
    return { audio: undefined, text: undefined };
  }
  const text = numberValue(details.text_tokens);
  const audio = numberValue(details.audio_tokens);
  if (positiveNumber(details.image_tokens)) {
    flags.add("speech_cached_image_tokens_unpriced");
  }
  return { audio, text };
}

function addTokenItem(
  items: CostLineItem[],
  event: RealtimeCostUsageSourceEvent,
  category: "speech_to_speech" | "input_transcription",
  options: { code: string; label: string; rate: number; tokens?: number }
): void {
  if (options.tokens === undefined || options.tokens === 0) return;
  items.push(RealtimeCostLineItemSchema.parse({
    amount_usd: roundUsd(options.tokens * options.rate / 1_000_000),
    category,
    code: options.code,
    label: options.label,
    model: event.model,
    quantity: options.tokens,
    rate_usd: options.rate,
    rate_unit: "million_tokens",
    source_event_count: 1,
    unit: "tokens"
  }));
}

function costUsageSourceEventFromRealtimeEvent(options: {
  createdAt: string;
  event: unknown;
  speechModel: string;
  transcriptionModel: string;
}): RealtimeCostUsageSourceEvent | undefined {
  const event = recordValue(options.event);
  const type = nonEmptyString(event?.type);
  if (type !== "response.done" &&
    type !== "conversation.item.input_audio_transcription.completed") {
    return undefined;
  }
  const response = recordValue(event?.response);
  return RealtimeCostUsageSourceEventSchema.parse({
    captured_at: options.createdAt,
    event_type: type,
    model: type === "response.done"
      ? nonEmptyString(response?.model) ?? options.speechModel
      : nonEmptyString(event?.model) ?? options.transcriptionModel,
    source_event_id: nonEmptyString(event?.event_id),
    usage: type === "response.done" ? response?.usage ?? null : event?.usage ?? null
  });
}

function speechPricing(model: string): SpeechRates | undefined {
  return model === "gpt-realtime-2"
    ? REALTIME_PRICING.models["gpt-realtime-2"].speech_to_speech
    : undefined;
}

function transcriptionPricing(model: string): TranscriptionRates | undefined {
  return model === "gpt-realtime-whisper"
    ? REALTIME_PRICING.models["gpt-realtime-whisper"].transcription
    : undefined;
}

function unavailableReasonsFor(
  flags: Set<string>,
  lineItems: CostLineItem[]
): string[] {
  if (flags.has("unknown_speech_model")) {
    return ["No frozen pricing is configured for the active Realtime model."];
  }
  if (lineItems.length === 0) {
    return ["No billable Realtime usage details have been captured yet."];
  }
  return [...flags].map((flag) => flag.replaceAll("_", " "));
}

function uncachedTokens(total: unknown, cached: number | undefined): number | undefined {
  const tokens = numberValue(total);
  if (tokens === undefined) return undefined;
  return Math.max(0, tokens - (cached ?? 0));
}

function positiveNumber(value: unknown): boolean {
  return (numberValue(value) ?? 0) > 0;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
