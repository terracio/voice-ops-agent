import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RealtimeModelEnv } from "./realtimeInstructions";
import { REALTIME_RUNNER_TRANSPORT } from "./realtimeRunnerTypes";
import type {
  RealtimePlatformTracing,
  RealtimeRunnerEnv,
  RealtimeRunnerResult,
  RealtimeTraceEvent
} from "./realtimeRunnerTypes";

export function timestamp(now: () => Date): string {
  return now().toISOString();
}

export function pushTrace(
  trace: RealtimeTraceEvent[],
  now: () => Date,
  event: Omit<RealtimeTraceEvent, "at">
): void {
  trace.push({ ...event, at: timestamp(now) });
}

export function sanitizeRealtimePayload(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[Max depth omitted]";
  if (value instanceof ArrayBuffer) {
    return { byteLength: value.byteLength };
  }
  if (ArrayBuffer.isView(value)) {
    return { byteLength: value.byteLength };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRealtimePayload(item, depth + 1));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "audio" && typeof nestedValue === "string") {
      output[key] = `[base64 audio omitted: ${nestedValue.length} chars]`;
      continue;
    }
    output[key] = sanitizeRealtimePayload(nestedValue, depth + 1);
  }
  return output;
}

export function loadOpenAIServerEnv(
  filePath = join(process.cwd(), ".env")
): "loaded" | "missing" | "unsupported" {
  if (!existsSync(filePath)) return "missing";
  if (typeof process.loadEnvFile !== "function") return "unsupported";
  process.loadEnvFile(filePath);
  return "loaded";
}

export function resolveOpenAIRealtimeCredentials(
  options: { apiKey?: string; env?: RealtimeRunnerEnv } = {}
): { ok: true; apiKey: string } | { ok: false; reason: string } {
  const apiKey = options.apiKey ?? options.env?.OPENAI_API_KEY;
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return { ok: false, reason: "missing_openai_api_key" };
  }
  return { ok: true, apiKey: trimmed };
}

export function createPcm16Silence(options: {
  durationMs?: number;
  sampleRate?: number;
} = {}): ArrayBuffer {
  const sampleRate = options.sampleRate ?? 24_000;
  const durationMs = options.durationMs ?? 300;
  const sampleCount = Math.max(1, Math.ceil((sampleRate * durationMs) / 1000));
  return new ArrayBuffer(sampleCount * 2);
}

export function skippedRealtimeRunnerResult(options: {
  model: string;
  platformTracing: RealtimePlatformTracing;
  reason: string;
  runId: string;
  sessionId: string;
  trace: RealtimeTraceEvent[];
}): RealtimeRunnerResult {
  return {
    status: "skipped",
    reason: options.reason,
    model: options.model,
    transport: REALTIME_RUNNER_TRANSPORT,
    run_id: options.runId,
    session_id: options.sessionId,
    platform_tracing: options.platformTracing,
    trace: options.trace,
    transcript_fragments: [],
    tool_calls: [],
    audit_ids: [],
    audit_events: [],
    final_state: {
      customer_states: [],
      payment_followups: [],
      kitchen_deltas: []
    },
    event_counts: {}
  };
}

export type { RealtimeModelEnv };
