import type { ToolResult } from "../domain/schema";
import type {
  ToolExecutionContext,
  ToolIdentityStatus
} from "../tools/context";
import { LookupCustomerOutputSchema } from "../tools/readToolSchemas";
import { timestamp } from "./realtimeRunnerSupport";

export type RealtimeSessionState = {
  current_user_turn_id?: string;
  identity_status: ToolIdentityStatus;
  last_user_turn_at?: string;
  last_user_message?: string;
  resolved_customer_id?: string;
};

export type RealtimeIdentityStateUpdate = {
  identity_status: ToolIdentityStatus;
  resolved_customer_id?: string;
};

export type RealtimeToolContextBase = Omit<
  ToolExecutionContext,
  "identity_status" | "resolved_customer_id"
>;

export function createRealtimeSessionState(): RealtimeSessionState {
  return { identity_status: "unknown" };
}

export function createRealtimeToolContextBase(options: {
  lastUserMessage: string;
  now: () => Date;
  runId: string;
  sessionId: string;
  userTurnId: string;
}): RealtimeToolContextBase {
  return {
    run_id: options.runId,
    session_id: options.sessionId,
    actor: "agent",
    current_user_turn_id: options.userTurnId,
    last_user_message: options.lastUserMessage,
    current_time: timestamp(options.now),
    reference_time: timestamp(options.now)
  };
}

export function buildRealtimeToolContext(options: {
  base: RealtimeToolContextBase;
  now?: () => Date;
  state: RealtimeSessionState;
}): ToolExecutionContext {
  const currentTime = options.now
    ? timestamp(options.now)
    : options.base.current_time;

  return {
    ...options.base,
    current_time: currentTime,
    current_user_turn_id: options.state.current_user_turn_id ??
      options.base.current_user_turn_id,
    ...(options.state.last_user_turn_at
      ? { last_user_turn_at: options.state.last_user_turn_at }
      : {}),
    last_user_message: options.state.last_user_message ??
      options.base.last_user_message,
    reference_time: currentTime,
    identity_status: options.state.identity_status,
    ...(options.state.resolved_customer_id
      ? { resolved_customer_id: options.state.resolved_customer_id }
      : {})
  };
}

export function applyRealtimeTranscriptEventToSessionState(options: {
  event: unknown;
  fallbackTurnId: string;
  now?: () => Date;
  state: RealtimeSessionState;
}): void {
  const event = asRecord(options.event);
  const eventType = typeof event?.type === "string" ? event.type : undefined;
  if (!event || !eventType || !isUserTranscriptEvent(eventType)) return;

  const text = textFromUserTranscriptEvent(event);
  if (!text) return;

  const turnId = turnIdFromEvent(event) ?? options.fallbackTurnId;
  if (eventType.endsWith(".delta")) {
    options.state.last_user_message =
      options.state.current_user_turn_id === turnId
        ? `${options.state.last_user_message ?? ""}${text}`
        : text;
  } else {
    options.state.last_user_message = text;
  }
  options.state.current_user_turn_id = turnId;
  options.state.last_user_turn_at = timestamp(
    options.now ?? (() => new Date())
  );
}

export function applyRealtimeToolResultToSessionState(options: {
  result: ToolResult<unknown>;
  state: RealtimeSessionState;
  toolName: string;
}): RealtimeIdentityStateUpdate | undefined {
  if (options.toolName !== "lookup_customer") return undefined;

  const nextState = identityStateFromLookupResult(options.result);
  options.state.identity_status = nextState.identity_status;
  options.state.resolved_customer_id = nextState.resolved_customer_id;
  return nextState;
}

function identityStateFromLookupResult(
  result: ToolResult<unknown>
): RealtimeIdentityStateUpdate {
  if (!result.ok) return { identity_status: "unknown" };

  const parsed = LookupCustomerOutputSchema.safeParse(result.data);
  if (!parsed.success) return { identity_status: "unknown" };

  const [candidate] = parsed.data.candidates;
  const confirmedSingleMatch =
    parsed.data.identity_status === "confirmed" &&
    parsed.data.candidate_count === 1 &&
    candidate?.identity_confidence === "confirmed";

  if (confirmedSingleMatch && candidate) {
    return {
      identity_status: "confirmed",
      resolved_customer_id: candidate.customer_id
    };
  }

  return { identity_status: "uncertain" };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textFromUserTranscriptEvent(
  event: Record<string, unknown>
): string | undefined {
  for (const value of [event.transcript, event.text, event.delta]) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function turnIdFromEvent(event: Record<string, unknown>): string | undefined {
  for (const value of [
    event.item_id,
    event.response_id,
    asRecord(event.item)?.id
  ]) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function isUserTranscriptEvent(eventType: string): boolean {
  return [
    "conversation.item.input_audio_transcription.completed",
    "conversation.item.input_audio_transcription.done",
    "conversation.item.input_audio_transcription.delta",
    "input_audio_buffer.transcription.completed",
    "input_audio_buffer.transcription.done",
    "input_audio_buffer.transcription.delta",
    "input_audio_transcription.completed",
    "input_audio_transcription.done",
    "input_audio_transcription.delta"
  ].includes(eventType);
}
