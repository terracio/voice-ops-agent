import {
  RealtimeAgent,
  RealtimeSession,
  type FunctionTool
} from "@openai/agents/realtime";
import type { ToolExecutionContext } from "../tools/context";
import {
  createMealPlanToolRegistry,
  mealPlanModelTools
} from "../tools/mealplanRegistry";
import type { ToolRegistry } from "../tools/registry";
import {
  DEFAULT_OPENAI_REALTIME_REASONING_EFFORT,
  MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
  resolveOpenAIRealtimeModel
} from "./realtimeInstructions";
import {
  createPcm16Silence,
  pushTrace,
  resolveOpenAIRealtimeCredentials,
  sanitizeRealtimePayload,
  skippedRealtimeRunnerResult,
  timestamp
} from "./realtimeRunnerSupport";
import {
  REALTIME_RUNNER_TRANSPORT,
  type RealtimeRunnerEnv,
  type RealtimeRunnerResult,
  type RealtimeRunnerStatus,
  type RealtimeSessionFactoryOptions,
  type RealtimeSessionLike,
  type RealtimeToolContext,
  type RealtimeTraceEvent,
  type RunRealtimeAgentSmokeOptions
} from "./realtimeRunnerTypes";
import { mealPlanRealtimeTools } from "./realtimeTools";

function normalizeToolInput(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function buildToolContext(options: {
  lastUserMessage: string;
  now: () => Date;
  runId: string;
  sessionId: string;
  userTurnId: string;
}): ToolExecutionContext {
  return {
    run_id: options.runId,
    session_id: options.sessionId,
    actor: "agent",
    current_user_turn_id: options.userTurnId,
    last_user_message: options.lastUserMessage,
    identity_status: "unknown",
    current_time: timestamp(options.now),
    reference_time: timestamp(options.now)
  };
}

export function createRealtimeAgentSdkTools(options: {
  getToolContext: () => ToolExecutionContext;
  registry?: ToolRegistry;
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
        const result = await registry.execute(realtimeTool.name, {
          modelArgs: normalizeToolInput(input),
          context: options.getToolContext()
        });
        return JSON.stringify(result);
      }
    };
  });
}

export function createMealPlanRealtimeAgent(options: {
  getToolContext: () => ToolExecutionContext;
  registry?: ToolRegistry;
}): RealtimeAgent<RealtimeToolContext> {
  return new RealtimeAgent<RealtimeToolContext>({
    name: "MealPlan VoiceOps",
    instructions: MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
    tools: createRealtimeAgentSdkTools(options),
    voice: "alloy"
  });
}

export function createRealtimeSessionFactoryOptions(options: {
  model: string;
  outputModalities?: ("text" | "audio")[];
}): RealtimeSessionFactoryOptions {
  return {
    model: options.model,
    transport: "websocket",
    tracingDisabled: true,
    config: {
      outputModalities: options.outputModalities ?? ["text"],
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24_000 },
          transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
          turnDetection: null
        }
      },
      reasoning: { effort: DEFAULT_OPENAI_REALTIME_REASONING_EFFORT },
      parallelToolCalls: false
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
  trace: RealtimeTraceEvent[],
  now: () => Date
): void {
  session.on("transport_event", (event) => {
    const eventType =
      typeof event === "object" && event !== null && "type" in event
        ? String(event.type)
        : "unknown";
    pushTrace(trace, now, {
      source: "transport",
      type: eventType,
      payload: sanitizeRealtimePayload(event)
    });
  });
  session.on("agent_tool_start", (_context, _agent, sdkTool, details) => {
    pushTrace(trace, now, {
      source: "tool",
      type: "agent_tool_start",
      payload: sanitizeRealtimePayload({ sdkTool, details })
    });
  });
  session.on("agent_tool_end", (_context, _agent, sdkTool, result, details) => {
    pushTrace(trace, now, {
      source: "tool",
      type: "agent_tool_end",
      payload: sanitizeRealtimePayload({ sdkTool, result, details })
    });
  });
  session.on("error", (error) => {
    pushTrace(trace, now, {
      source: "session",
      type: "error",
      payload: sanitizeRealtimePayload(error)
    });
  });
}

function waitForTerminalEvent(
  session: RealtimeSessionLike,
  timeoutMs: number
): Promise<Exclude<RealtimeRunnerStatus, "skipped">> {
  const terminalTypes = new Set(["response.done", "turn_done"]);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve("timed_out"), timeoutMs);
    session.on("transport_event", (event) => {
      if (typeof event !== "object" || event === null || !("type" in event)) {
        return;
      }
      const eventType = String(event.type);
      if (terminalTypes.has(eventType)) {
        clearTimeout(timeout);
        resolve("completed");
      }
      if (eventType === "error") {
        clearTimeout(timeout);
        resolve("failed");
      }
    });
    session.on("error", () => {
      clearTimeout(timeout);
      resolve("failed");
    });
  });
}

export async function runRealtimeAgentSmoke(
  options: RunRealtimeAgentSmokeOptions = {}
): Promise<RealtimeRunnerResult> {
  const now = options.now ?? (() => new Date());
  const trace: RealtimeTraceEvent[] = [];
  const env: RealtimeRunnerEnv = options.env ?? {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL
  };
  const model = options.model ?? resolveOpenAIRealtimeModel(env);
  const runId = options.runId ?? `realtime_run_${Date.now()}`;
  const sessionId = options.sessionId ?? `realtime_session_${Date.now()}`;
  const userTurnId = options.userTurnId ?? `${sessionId}_turn_001`;
  const credentials = resolveOpenAIRealtimeCredentials({
    apiKey: options.apiKey,
    env
  });

  if (!credentials.ok) {
    return skippedRealtimeRunnerResult({
      reason: credentials.reason,
      model,
      runId,
      sessionId,
      trace
    });
  }

  const lastUserMessage =
    options.lastUserMessage ?? "Realtime smoke audio fixture.";
  const toolContext = buildToolContext({
    lastUserMessage,
    now,
    runId,
    sessionId,
    userTurnId
  });
  const agent = createMealPlanRealtimeAgent({
    registry: options.registry,
    getToolContext: () => toolContext
  });
  const sessionOptions = createRealtimeSessionFactoryOptions({
    model,
    outputModalities: options.outputModalities
  });
  const session = (options.sessionFactory ?? createSdkRealtimeSession)(
    agent,
    sessionOptions
  );

  attachTraceListeners(session, trace, now);
  pushTrace(trace, now, {
    source: "runner",
    type: "connect_start",
    payload: {
      model,
      transport: REALTIME_RUNNER_TRANSPORT,
      tool_count: mealPlanModelTools.length
    }
  });

  try {
    await session.connect({ apiKey: credentials.apiKey });
    pushTrace(trace, now, { source: "runner", type: "connect_done" });

    const terminalEvent = waitForTerminalEvent(
      session,
      options.timeoutMs ?? 20_000
    );
    if (options.inputText) {
      session.sendMessage(options.inputText);
    } else {
      session.sendAudio(options.audio ?? createPcm16Silence(), {
        commit: true
      });
      session.transport?.requestResponse?.();
    }

    const status = await terminalEvent;
    return {
      status,
      reason:
        status === "timed_out" ? "realtime_terminal_event_timeout" : undefined,
      model,
      transport: REALTIME_RUNNER_TRANSPORT,
      run_id: runId,
      session_id: sessionId,
      trace
    };
  } catch (error) {
    pushTrace(trace, now, {
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
      trace
    };
  } finally {
    session.close();
  }
}
