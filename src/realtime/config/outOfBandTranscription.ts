import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  RealtimeTraceEvent,
  RealtimeOutOfBandTranscription,
  RealtimeSessionLike
} from "../runner/types";

const OOB_TRANSCRIPTION_PURPOSE = "oob_realtime_transcription";
const oobTranscriptionSourceUrl = new URL(
  "./outOfBandTranscription.md",
  import.meta.url
);

export const OOB_TRANSCRIPTION_INSTRUCTIONS_SOURCE_PATH = fileURLToPath(
  oobTranscriptionSourceUrl
);
export const OOB_TRANSCRIPTION_INSTRUCTIONS = readFileSync(
  oobTranscriptionSourceUrl,
  "utf8"
).trim();

type TransportEvent = Record<string, unknown>;

export function runRealtimeOutOfBandTranscription(options: {
  session: RealtimeSessionLike;
  timeoutMs?: number;
  userAudioItemId?: string;
}): Promise<RealtimeOutOfBandTranscription> {
  const transport = options.session.transport;
  const requestResponse = transport?.requestResponse?.bind(transport);
  if (!requestResponse) {
    return Promise.resolve({
      status: "skipped",
      reason: "transport_request_response_unavailable"
    });
  }

  return new Promise((resolve) => {
    let responseId: string | undefined;
    let settled = false;
    let transcript = "";
    const timeout = setTimeout(() => {
      finish({ status: "timed_out", response_id: responseId });
    }, options.timeoutMs ?? 10_000);

    options.session.on("transport_event", (event) => {
      const record = asRecord(event);
      if (!record || settled) return;

      if (record.type === "error") {
        finish({
          status: "failed",
          response_id: responseId,
          reason: diagnosticReason(record.error ?? record)
        });
        return;
      }
      if (record.type === "response.created" && !responseId) {
        responseId = nestedString(record.response, "id");
        return;
      }
      if (!isTargetResponse(record, responseId)) return;

      if (record.type === "response.output_text.delta") {
        transcript += stringValue(record.delta) ?? "";
      }
      if (record.type === "response.output_text.done") {
        transcript = stringValue(record.text) ?? transcript;
      }
      if (record.type === "response.done") {
        finish({
          status: "completed",
          response_id: responseId,
          transcript
        });
      }
    });

    const response: Record<string, unknown> = {
      conversation: "none",
      instructions: OOB_TRANSCRIPTION_INSTRUCTIONS,
      metadata: { purpose: OOB_TRANSCRIPTION_PURPOSE },
      output_modalities: ["text"],
      tool_choice: "none",
      tools: []
    };
    if (options.userAudioItemId) {
      response.input = [{ id: options.userAudioItemId, type: "item_reference" }];
    }
    try {
      const result = requestResponse(response) as unknown;
      void Promise.resolve(result).catch((error: unknown) => {
        finish({
          status: "failed",
          response_id: responseId,
          reason: diagnosticReason(error)
        });
      });
    } catch (error) {
      finish({
        status: "failed",
        response_id: responseId,
        reason: diagnosticReason(error)
      });
    }

    function finish(result: RealtimeOutOfBandTranscription): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    }
  });
}

export function findLatestUserAudioItemId(
  trace: RealtimeTraceEvent[]
): string | undefined {
  for (const event of [...trace].reverse()) {
    const itemId = itemIdFromCommittedEvent(event) ?? itemIdFromUserAudioItem(event);
    if (itemId) return itemId;
  }
  return undefined;
}

function itemIdFromCommittedEvent(event: RealtimeTraceEvent): string | undefined {
  if (event.type !== "input_audio_buffer.committed") return undefined;
  return stringValue(asRecord(event.payload)?.item_id);
}

function itemIdFromUserAudioItem(event: RealtimeTraceEvent): string | undefined {
  if (
    event.type !== "conversation.item.added" &&
    event.type !== "conversation.item.done"
  ) return undefined;
  const item = asRecord(asRecord(event.payload)?.item);
  if (item?.role !== "user") return undefined;
  if (!hasInputAudio(item.content)) return undefined;
  return stringValue(item.id);
}

function hasInputAudio(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((block) => asRecord(block)?.type === "input_audio");
}

function isTargetResponse(
  event: TransportEvent,
  responseId: string | undefined
): boolean {
  if (!responseId) return false;
  return event.response_id === responseId ||
    nestedString(event.response, "id") === responseId;
}

function asRecord(value: unknown): TransportEvent | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as TransportEvent;
}

function nestedString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return stringValue((value as Record<string, unknown>)[key]);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function diagnosticReason(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;

  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested === "bigint") return nested.toString();
      if (typeof nested !== "object" || nested === null) return nested;
      if (seen.has(nested)) return "[Circular]";
      seen.add(nested);
      return nested;
    }) ?? "out_of_band_transcription_failed";
  } catch {
    return "out_of_band_transcription_failed";
  }
}
