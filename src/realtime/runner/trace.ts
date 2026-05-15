import {
  getAuditEventsByRunId,
  getCustomerState,
  listKitchenExportDeltas,
  listPaymentFollowups
} from "../../domain/db";
import type { ToolResult } from "../../domain/schema";
import {
  pushTrace,
  sanitizeRealtimePayload,
  timestamp
} from "./support";
import type {
  RealtimeTraceEvent,
  RealtimeTraceSummary,
  RealtimeToolCallStatus,
  RealtimeToolCallTrace,
  RealtimeTranscriptFragment
} from "./types";

type TraceCollectorOptions = {
  now: () => Date;
};

type ToolStartOptions = {
  input: unknown;
  toolName: string;
};

type TransportEventRecord = Record<string, unknown>;

export type RealtimeTraceCollector = {
  readonly trace: RealtimeTraceEvent[];
  recordEvent: (event: Omit<RealtimeTraceEvent, "at">) => void;
  recordTransportEvent: (event: unknown) => void;
  recordToolStart: (options: ToolStartOptions) => RealtimeToolCallTrace;
  recordToolResult: (toolCallId: string, result: ToolResult<unknown>) => void;
  recordToolException: (toolCallId: string, error: unknown) => void;
  summarize: (runId: string) => RealtimeTraceSummary;
};

export function emptyRealtimeTraceSummary(): RealtimeTraceSummary {
  return {
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

export function createRealtimeTraceCollector(
  options: TraceCollectorOptions
): RealtimeTraceCollector {
  const trace: RealtimeTraceEvent[] = [];
  const transcriptFragments: RealtimeTranscriptFragment[] = [];
  const toolCalls: RealtimeToolCallTrace[] = [];
  let toolSequence = 0;

  function recordEvent(event: Omit<RealtimeTraceEvent, "at">): void {
    pushTrace(trace, options.now, {
      ...event,
      payload: sanitizeRealtimePayload(event.payload)
    });
  }

  function recordTransportEvent(event: unknown): void {
    const eventRecord = asRecord(event);
    const type = getTransportEventType(eventRecord);
    const at = timestamp(options.now);
    trace.push({
      at,
      source: "transport",
      type,
      payload: sanitizeRealtimePayload(event)
    });

    const fragment = toTranscriptFragment(eventRecord, type, at);
    if (fragment) transcriptFragments.push(fragment);
  }

  function recordToolStart(
    startOptions: ToolStartOptions
  ): RealtimeToolCallTrace {
    toolSequence += 1;
    const toolCall: RealtimeToolCallTrace = {
      tool_call_id: `rt_tool_${String(toolSequence).padStart(3, "0")}`,
      tool_name: startOptions.toolName,
      status: "started",
      input: sanitizeRealtimePayload(startOptions.input),
      audit_event_ids: [],
      started_at: timestamp(options.now)
    };
    toolCalls.push(toolCall);
    recordEvent({
      source: "tool",
      type: "tool_call_started",
      payload: toolCall
    });
    return toolCall;
  }

  function recordToolResult(
    toolCallId: string,
    result: ToolResult<unknown>
  ): void {
    const toolCall = toolCalls.find((candidate) => {
      return candidate.tool_call_id === toolCallId;
    });
    if (!toolCall) return;

    toolCall.status = getToolStatus(result);
    toolCall.output = sanitizeRealtimePayload(result);
    toolCall.audit_event_ids = result.audit_event_ids;
    toolCall.finished_at = timestamp(options.now);
    if (!result.ok) toolCall.policy_id = result.error.policy_id;
    recordEvent({
      source: "tool",
      type: "tool_call_completed",
      payload: toolCall
    });
  }

  function recordToolException(toolCallId: string, error: unknown): void {
    const toolCall = toolCalls.find((candidate) => {
      return candidate.tool_call_id === toolCallId;
    });
    if (!toolCall) return;

    toolCall.status = "failed";
    toolCall.output = sanitizeRealtimePayload(error);
    toolCall.finished_at = timestamp(options.now);
    recordEvent({
      source: "tool",
      type: "tool_call_failed",
      payload: toolCall
    });
  }

  function summarize(runId: string): RealtimeTraceSummary {
    const auditEvents = getAuditEventsByRunId(runId);
    const customerIds = new Set(
      auditEvents
        .map((event) => event.customer_id)
        .filter((customerId): customerId is string => Boolean(customerId))
    );

    return {
      transcript_fragments: [...transcriptFragments],
      tool_calls: toolCalls.map((toolCall) => ({ ...toolCall })),
      audit_ids: auditEvents.map((event) => event.event_id),
      audit_events: auditEvents,
      final_state: {
        customer_states: [...customerIds]
          .map((customerId) => getCustomerState(customerId))
          .filter((state): state is NonNullable<typeof state> => Boolean(state)),
        payment_followups: listPaymentFollowups().filter((followup) => {
          return customerIds.has(followup.customer_id);
        }),
        kitchen_deltas: listKitchenExportDeltas().filter((delta) => {
          return customerIds.has(delta.customer_id);
        })
      },
      event_counts: buildEventCounts(trace)
    };
  }

  return {
    trace,
    recordEvent,
    recordTransportEvent,
    recordToolStart,
    recordToolResult,
    recordToolException,
    summarize
  };
}

function asRecord(value: unknown): TransportEventRecord | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as TransportEventRecord;
}

function getTransportEventType(event: TransportEventRecord | undefined): string {
  return typeof event?.type === "string" ? event.type : "unknown";
}

function toTranscriptFragment(
  event: TransportEventRecord | undefined,
  sourceEventType: string,
  at: string
): RealtimeTranscriptFragment | undefined {
  if (!event) return undefined;
  const transcript = stringValue(event.transcript);
  const text = stringValue(event.text);
  const delta = stringValue(event.delta);

  if (sourceEventType === "conversation.item.input_audio_transcription.completed") {
    if (!transcript) return undefined;
    return buildFragment(event, at, "user", transcript, sourceEventType);
  }
  if (sourceEventType.startsWith("response.output_text")) {
    const assistantText = delta ?? text;
    if (!assistantText) return undefined;
    return buildFragment(event, at, "assistant", assistantText, sourceEventType);
  }
  if (sourceEventType === "response.audio_transcript.delta" && delta) {
    return buildFragment(event, at, "assistant", delta, sourceEventType);
  }
  if (sourceEventType === "response.audio_transcript.done" && transcript) {
    return buildFragment(event, at, "assistant", transcript, sourceEventType);
  }
  return undefined;
}

function buildFragment(
  event: TransportEventRecord,
  at: string,
  role: "assistant" | "user",
  text: string,
  sourceEventType: string
): RealtimeTranscriptFragment {
  return {
    at,
    role,
    text,
    source_event_type: sourceEventType,
    item_id: stringValue(event.item_id),
    response_id: stringValue(event.response_id)
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getToolStatus(result: ToolResult<unknown>): RealtimeToolCallStatus {
  if (result.ok) return "completed";
  return result.error.policy_id ? "blocked" : "failed";
}

function buildEventCounts(
  trace: RealtimeTraceEvent[]
): Record<string, number> {
  return trace.reduce<Record<string, number>>((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
}
