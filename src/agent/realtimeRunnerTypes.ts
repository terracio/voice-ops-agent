import type { RealtimeAgent } from "@openai/agents/realtime";
import type { CustomerState } from "../domain/db";
import type {
  AuditEvent,
  KitchenExportDelta,
  PaymentFollowup
} from "../domain/schema";
import type { ToolExecutionContext } from "../tools/context";
import type { ToolRegistry } from "../tools/registry";
import type { RealtimeModelEnv } from "./realtimeInstructions";

export const REALTIME_RUNNER_TRANSPORT = "agents-sdk-websocket";

export type RealtimeRunnerEnv = RealtimeModelEnv & {
  OPENAI_API_KEY?: string;
};

export type RealtimeTraceEvent = {
  at: string;
  source: "runner" | "session" | "transport" | "tool";
  type: string;
  payload?: unknown;
};

export type RealtimeTranscriptFragment = {
  at: string;
  role: "assistant" | "user";
  text: string;
  source_event_type: string;
  item_id?: string;
  response_id?: string;
};

export type RealtimeToolCallStatus =
  | "blocked"
  | "completed"
  | "failed"
  | "started";

export type RealtimeToolCallTrace = {
  tool_call_id: string;
  tool_name: string;
  status: RealtimeToolCallStatus;
  input: unknown;
  audit_event_ids: string[];
  started_at: string;
  finished_at?: string;
  output?: unknown;
  policy_id?: string;
};

export type RealtimeFinalStateSnapshot = {
  customer_states: CustomerState[];
  payment_followups: PaymentFollowup[];
  kitchen_deltas: KitchenExportDelta[];
};

export type RealtimeTraceSummary = {
  transcript_fragments: RealtimeTranscriptFragment[];
  tool_calls: RealtimeToolCallTrace[];
  audit_ids: string[];
  audit_events: AuditEvent[];
  final_state: RealtimeFinalStateSnapshot;
  event_counts: Record<string, number>;
};

export type RealtimeRunnerStatus =
  | "completed"
  | "failed"
  | "skipped"
  | "timed_out";

export type RealtimeRunnerResult = {
  status: RealtimeRunnerStatus;
  reason?: string;
  model: string;
  transport: typeof REALTIME_RUNNER_TRANSPORT;
  run_id: string;
  session_id: string;
  trace: RealtimeTraceEvent[];
} & RealtimeTraceSummary;

export type RealtimeSessionLike = {
  on: (eventName: string, handler: (...args: unknown[]) => void) => unknown;
  connect: (options: { apiKey: string }) => Promise<void>;
  sendAudio: (audio: ArrayBuffer, options?: { commit?: boolean }) => void;
  sendMessage: (message: string) => void;
  close: () => void;
  transport?: {
    requestResponse?: () => void;
  };
};

export type RealtimeSessionFactory = (
  agent: RealtimeAgent<RealtimeToolContext>,
  options: RealtimeSessionFactoryOptions
) => RealtimeSessionLike;

export type RealtimeSessionFactoryOptions = {
  model: string;
  config: {
    outputModalities: ("text" | "audio")[];
    audio: {
      input: {
        format: { type: "audio/pcm"; rate: number };
        transcription: { model: string; language: string };
        turnDetection: null;
      };
    };
    reasoning: { effort: "low" };
    parallelToolCalls: false;
  };
  transport: "websocket";
  tracingDisabled: true;
};

export type RealtimeToolContext = {
  toolContext: ToolExecutionContext;
};

export type RunRealtimeAgentSmokeOptions = {
  audio?: ArrayBuffer;
  audioChunkDurationMs?: number;
  apiKey?: string;
  env?: RealtimeRunnerEnv;
  inputText?: string;
  lastUserMessage?: string;
  model?: string;
  now?: () => Date;
  outputModalities?: ("text" | "audio")[];
  registry?: ToolRegistry;
  runId?: string;
  sessionFactory?: RealtimeSessionFactory;
  sessionId?: string;
  settleMs?: number;
  timeoutMs?: number;
  userTurnId?: string;
};
