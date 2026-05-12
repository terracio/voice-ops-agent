import type { RealtimeAgent } from "@openai/agents/realtime";
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
};

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
  timeoutMs?: number;
  userTurnId?: string;
};
