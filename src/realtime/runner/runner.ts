import { RealtimeAgent, RealtimeSession, type FunctionTool } from "@openai/agents/realtime";
import type { ToolExecutionContext } from "../../tools/context";
import { createMealPlanToolRegistry } from "../../tools/mealplanRegistry";
import type { ToolRegistry } from "../../tools/registry";
import { DEFAULT_OPENAI_REALTIME_REASONING_EFFORT, MEALPLAN_REALTIME_AGENT_INSTRUCTIONS, resolveOpenAIRealtimeModel } from "../config/instructions";
import { REALTIME_RUNTIME_CONFIG } from "../config/runtimeConfig";
import { streamPcm16AudioToRealtimeSession } from "./audioStream";
import { createRealtimePlatformTracing, DEFAULT_REALTIME_WORKFLOW_NAME } from "../server/platformTracing";
import { findLatestUserAudioItemId, runRealtimeOutOfBandTranscription } from "../config/outOfBandTranscription";
import { waitForRealtimeTurnComplete } from "./timing";
import {
  createPcm16Silence,
  resolveOpenAIRealtimeCredentials,
  sanitizeRealtimePayload,
  skippedRealtimeRunnerResult
} from "./support";
import { applyRealtimeToolResultToSessionState, buildRealtimeToolContext, createRealtimeSessionState, createRealtimeToolContextBase, type RealtimeSessionState } from "../server/sessionState";
import { createRealtimeTraceCollector, type RealtimeTraceCollector } from "./trace";
import {
  REALTIME_RUNNER_TRANSPORT,
  type RealtimeRunnerEnv,
  type RealtimeRunnerResult,
  type RealtimeSessionFactoryOptions,
  type RealtimeSessionLike,
  type RealtimeToolContext,
  type RunRealtimeAgentSmokeOptions
} from "./types";
import { mealPlanRealtimeTools } from "../config/tools";

function normalizeToolInput(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function createRealtimeAgentSdkTools(options: {
  getToolContext: () => ToolExecutionContext;
  registry?: ToolRegistry;
  sessionState?: RealtimeSessionState;
  traceCollector?: RealtimeTraceCollector;
}): FunctionTool<RealtimeToolContext>[] {
  const registry = options.registry ?? createMealPlanToolRegistry();

  return mealPlanRealtimeTools.map((realtimeTool) => {
    if (!registry.get(realtimeTool.name)) {
      throw new Error(`Tool "${realtimeTool.name}" is missing from registry.`);
    }

    return {
      type: "function",
      name: realtimeTool.name,
      description: realtimeTool.description,
      parameters: realtimeTool.parameters as FunctionTool<RealtimeToolContext>["parameters"],
      strict: false,
      needsApproval: async () => false,
      isEnabled: async () => true,
      invoke: async (_runContext, input) => {
        const modelArgs = normalizeToolInput(input);
        const toolCall = options.traceCollector?.recordToolStart({
          toolName: realtimeTool.name,
          input: modelArgs
        });
        try {
          const result = await registry.execute(realtimeTool.name, {
            modelArgs,
            context: options.getToolContext()
          });
          const identityUpdate = options.sessionState
            ? applyRealtimeToolResultToSessionState({
              result,
              state: options.sessionState,
              toolName: realtimeTool.name
            })
            : undefined;
          if (identityUpdate) {
            options.traceCollector?.recordEvent({
              source: "runner",
              type: "identity_state_updated",
              payload: identityUpdate
            });
          }
          if (toolCall) {
            options.traceCollector?.recordToolResult(
              toolCall.tool_call_id,
              result
            );
          }
          return JSON.stringify(result);
        } catch (error) {
          if (toolCall) {
            options.traceCollector?.recordToolException(
              toolCall.tool_call_id,
              error
            );
          }
          throw error;
        }
      }
    };
  });
}

export function createMealPlanRealtimeAgent(options: {
  getToolContext: () => ToolExecutionContext;
  registry?: ToolRegistry;
  sessionState?: RealtimeSessionState;
  traceCollector?: RealtimeTraceCollector;
}): RealtimeAgent<RealtimeToolContext> {
  return new RealtimeAgent<RealtimeToolContext>({
    name: "MealPlan VoiceOps",
    instructions: MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
    tools: createRealtimeAgentSdkTools(options),
    voice: REALTIME_RUNTIME_CONFIG.shared.voice
  });
}

export function createRealtimeSessionFactoryOptions(options: {
  model: string;
  outputModalities?: ("text" | "audio")[];
  traceGroupId?: string;
  traceMetadata?: Record<string, string>;
  tracingDisabled?: boolean;
  workflowName?: string;
}): RealtimeSessionFactoryOptions {
  const tracingDisabled = options.tracingDisabled ?? false;
  return {
    model: options.model,
    transport: "websocket",
    tracingDisabled,
    workflowName: tracingDisabled
      ? undefined
      : options.workflowName ?? DEFAULT_REALTIME_WORKFLOW_NAME,
    groupId: tracingDisabled ? undefined : options.traceGroupId,
    traceMetadata: tracingDisabled ? undefined : options.traceMetadata,
    config: {
      outputModalities: options.outputModalities ??
        [...REALTIME_RUNTIME_CONFIG.evalReplay.outputModalities],
      audio: {
        input: {
          format: {
            type: REALTIME_RUNTIME_CONFIG.evalReplay.inputAudio.format,
            rate: REALTIME_RUNTIME_CONFIG.evalReplay.inputAudio.sampleRateHz
          },
          transcription: REALTIME_RUNTIME_CONFIG.shared.inputTranscription,
          turnDetection: REALTIME_RUNTIME_CONFIG.evalReplay.turnDetection
        }
      },
      reasoning: { effort: DEFAULT_OPENAI_REALTIME_REASONING_EFFORT },
      parallelToolCalls: REALTIME_RUNTIME_CONFIG.shared.parallelToolCalls
    }
  };
}

export function createSdkRealtimeSession(
  agent: RealtimeAgent<RealtimeToolContext>,
  options: RealtimeSessionFactoryOptions
): RealtimeSessionLike {
  const session = new RealtimeSession(agent, options);
  return {
    on: (eventName, handler) => {
      session.on(eventName as never, handler as never);
    },
    connect: (connectOptions) => session.connect(connectOptions),
    sendAudio: (audio, sendOptions) => session.sendAudio(audio, sendOptions),
    sendMessage: (message) => session.sendMessage(message),
    close: () => session.close(),
    transport: session.transport
  };
}

function attachTraceListeners(
  session: RealtimeSessionLike,
  collector: RealtimeTraceCollector
): void {
  session.on("transport_event", (event) => {
    collector.recordTransportEvent(event);
  });
  session.on("agent_tool_start", (_context, _agent, sdkTool, details) => {
    collector.recordEvent({
      source: "tool",
      type: "agent_tool_start",
      payload: sanitizeRealtimePayload({ sdkTool, details })
    });
  });
  session.on("agent_tool_end", (_context, _agent, sdkTool, result, details) => {
    collector.recordEvent({
      source: "tool",
      type: "agent_tool_end",
      payload: sanitizeRealtimePayload({ sdkTool, result, details })
    });
  });
  session.on("error", (error) => {
    collector.recordEvent({
      source: "session",
      type: "error",
      payload: sanitizeRealtimePayload(error)
    });
  });
}

export async function runRealtimeAgentSmoke(
  options: RunRealtimeAgentSmokeOptions = {}
): Promise<RealtimeRunnerResult> {
  const now = options.now ?? (() => new Date());
  const collector = createRealtimeTraceCollector({ now });
  const trace = collector.trace;
  const env: RealtimeRunnerEnv = options.env ?? {
    OPENAI_AGENTS_DISABLE_TRACING: process.env.OPENAI_AGENTS_DISABLE_TRACING,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_REALTIME_DISABLE_TRACING: process.env.OPENAI_REALTIME_DISABLE_TRACING,
    OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL
  };
  const model = options.model ?? resolveOpenAIRealtimeModel(env);
  const runId = options.runId ?? `realtime_run_${Date.now()}`;
  const sessionId = options.sessionId ?? `realtime_session_${Date.now()}`;
  const userTurnId = options.userTurnId ?? `${sessionId}_turn_001`;
  const platformTracing = createRealtimePlatformTracing({
    env,
    runId,
    sessionId,
    traceGroupId: options.traceGroupId,
    traceMetadata: options.traceMetadata,
    tracingDisabled: options.tracingDisabled,
    workflowName: options.workflowName
  });
  const credentials = resolveOpenAIRealtimeCredentials({
    apiKey: options.apiKey,
    env
  });

  if (!credentials.ok) {
    return skippedRealtimeRunnerResult({
      reason: credentials.reason,
      model,
      platformTracing,
      runId,
      sessionId,
      trace
    });
  }

  const lastUserMessage =
    options.lastUserMessage ?? "Realtime smoke audio fixture.";
  const sessionState = createRealtimeSessionState();
  const toolContextBase = createRealtimeToolContextBase({
    lastUserMessage,
    now,
    runId,
    sessionId,
    userTurnId
  });
  const agent = createMealPlanRealtimeAgent({
    registry: options.registry,
    sessionState,
    getToolContext: () =>
      buildRealtimeToolContext({ base: toolContextBase, state: sessionState }),
    traceCollector: collector
  });
  const sessionOptions = createRealtimeSessionFactoryOptions({
    model,
    outputModalities: options.outputModalities,
    traceGroupId: platformTracing.group_id,
    traceMetadata: platformTracing.metadata,
    tracingDisabled: !platformTracing.enabled,
    workflowName: platformTracing.workflow_name
  });
  const session = (options.sessionFactory ?? createSdkRealtimeSession)(
    agent,
    sessionOptions
  );

  attachTraceListeners(session, collector);
  collector.recordEvent({
    source: "runner",
    type: "connect_start",
    payload: {
      model,
      platform_tracing_enabled: platformTracing.enabled,
      transport: REALTIME_RUNNER_TRANSPORT,
      tool_count: mealPlanRealtimeTools.length
    }
  });

  try {
    await session.connect({ apiKey: credentials.apiKey });
    collector.recordEvent({ source: "runner", type: "connect_done" });

    const terminalEvent = waitForRealtimeTurnComplete({
      session,
      quietMs: options.quietMs,
      timeoutMs: options.timeoutMs ?? REALTIME_RUNTIME_CONFIG.evalReplay.timeoutMs
    });
    if (options.inputText) {
      session.sendMessage(options.inputText);
    } else {
      const audioStream = streamPcm16AudioToRealtimeSession(
        session,
        options.audio ?? createPcm16Silence(),
        { chunkDurationMs: options.audioChunkDurationMs }
      );
      collector.recordEvent({
        source: "runner",
        type: "audio_stream_sent",
        payload: audioStream
      });
    }

    const status = await terminalEvent;
    const summary = collector.summarize(runId);
    const outOfBandTranscription = status === "completed" &&
      options.outOfBandTranscription
      ? await runRealtimeOutOfBandTranscription({ session, userAudioItemId: findLatestUserAudioItemId(trace) })
      : undefined;
    return {
      status,
      reason:
        status === "timed_out" ? "realtime_terminal_event_timeout" : undefined,
      model,
      transport: REALTIME_RUNNER_TRANSPORT,
      run_id: runId,
      session_id: sessionId,
      platform_tracing: platformTracing,
      trace,
      out_of_band_transcription: outOfBandTranscription,
      ...summary
    };
  } catch (error) {
    collector.recordEvent({
      source: "runner",
      type: "run_failed",
      payload: sanitizeRealtimePayload(error)
    });
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "realtime_run_failed",
      model,
      transport: REALTIME_RUNNER_TRANSPORT,
      run_id: runId,
      session_id: sessionId,
      platform_tracing: platformTracing,
      trace,
      ...collector.summarize(runId)
    };
  } finally {
    session.close();
  }
}
