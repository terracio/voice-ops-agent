import type { ToolResult } from "../domain/schema";
import type {
  ToolExecutionContext,
  ToolIdentityStatus
} from "../tools/context";
import { LookupCustomerOutputSchema } from "../tools/readToolSchemas";
import { timestamp } from "./realtimeRunnerSupport";

export type RealtimeSessionState = {
  identity_status: ToolIdentityStatus;
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
  state: RealtimeSessionState;
}): ToolExecutionContext {
  return {
    ...options.base,
    identity_status: options.state.identity_status,
    ...(options.state.resolved_customer_id
      ? { resolved_customer_id: options.state.resolved_customer_id }
      : {})
  };
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
