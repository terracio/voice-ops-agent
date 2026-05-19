import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMealPlanRealtimeAgent,
  createRealtimeAgentSdkTools,
  createRealtimeSessionFactoryOptions,
  runRealtimeAgentSmoke
} from "../src/realtime/runner/runner";
import { resolveOpenAIRealtimeCredentials } from "../src/realtime/runner/support";
import {
  REALTIME_RUNNER_TRANSPORT,
  type RealtimeSessionLike
} from "../src/realtime/runner/types";
import { createRealtimeTraceCollector } from "../src/realtime/runner/trace";
import {
  buildRealtimeToolContext,
  createRealtimeSessionState,
  createRealtimeToolContextBase
} from "../src/realtime/server/sessionState";
import { resetDb } from "../src/domain/db";
import { createMealPlanToolRegistry } from "../src/tools";
import type { ToolExecutionContext } from "../src/tools/context";

const toolContext: ToolExecutionContext = {
  run_id: "run_realtime_test",
  session_id: "realtime_session_test",
  actor: "agent",
  current_user_turn_id: "turn_realtime_001",
  last_user_message: "Please look up Maya.",
  identity_status: "unknown",
  current_time: "2026-05-11T10:00:00Z",
  reference_time: "2026-05-11T10:00:00Z"
};

class FakeRealtimeSession implements RealtimeSessionLike {
  readonly close = vi.fn();
  readonly connect = vi.fn(async () => undefined);
  readonly sendMessage = vi.fn((message: string) => {
    this.emit("transport_event", {
      type: "conversation.item.created",
      text: message
    });
  });
  readonly sendAudio = vi.fn((audio: ArrayBuffer) => {
    this.emit("transport_event", {
      type: "input_audio_buffer.committed",
      audio
    });
  });
  readonly transport = {
    requestResponse: vi.fn(() => {
      this.emit("transport_event", { type: "response.done" });
    })
  };

  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  on(eventName: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  private emit(eventName: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(...args);
    }
  }
}

describe("Realtime runner", () => {
  beforeEach(() => {
    resetDb();
  });

  it("resolves OpenAI credentials without exposing .env contents", () => {
    expect(resolveOpenAIRealtimeCredentials({ env: {} })).toEqual({
      ok: false,
      reason: "missing_openai_api_key"
    });
    expect(
      resolveOpenAIRealtimeCredentials({
        env: { OPENAI_API_KEY: "  sk-test  " }
      })
    ).toEqual({ ok: true, apiKey: "sk-test" });
  });

  it("creates SDK Realtime tools that execute through the server registry", async () => {
    const registry = createMealPlanToolRegistry();
    const traceCollector = createRealtimeTraceCollector({
      now: () => new Date("2026-05-11T10:00:00Z")
    });
    const sdkTools = createRealtimeAgentSdkTools({
      registry,
      getToolContext: () => toolContext,
      traceCollector
    });
    const lookupCustomer = sdkTools.find((sdkTool) => sdkTool.name === "lookup_customer");

    expect(lookupCustomer).toBeDefined();
    const result = await lookupCustomer?.invoke(
      {} as never,
      JSON.stringify({ customer_id: "cus_001" })
    );

    expect(JSON.parse(String(result))).toMatchObject({
      ok: true,
      data: {
        identity_status: "confirmed",
        candidate_count: 1
      }
    });
    const summary = traceCollector.summarize(toolContext.run_id);
    expect(summary.audit_ids).toHaveLength(1);
    expect(summary.tool_calls[0]?.audit_event_ids).toHaveLength(1);
    expect(
      traceCollector.trace.find((event) => event.type === "tool_call_started")
        ?.payload
    ).toMatchObject({ status: "started" });
    expect(summary).toMatchObject({
      tool_calls: [
        {
          tool_name: "lookup_customer",
          status: "completed",
          audit_event_ids: expect.any(Array)
        }
      ],
      audit_ids: expect.any(Array),
      final_state: {
        customer_states: [
          {
            customer: {
              customer_id: "cus_001"
            }
          }
        ]
      }
    });
  });

  it("returns structured blocked tool results in Realtime traces", async () => {
    const traceCollector = createRealtimeTraceCollector({
      now: () => new Date("2026-05-11T10:00:00Z")
    });
    const sdkTools = createRealtimeAgentSdkTools({
      registry: createMealPlanToolRegistry(),
      getToolContext: () => toolContext,
      traceCollector
    });
    const getCustomerState = sdkTools.find((sdkTool) => sdkTool.name === "get_customer_state");

    expect(getCustomerState).toBeDefined();
    const result = await getCustomerState?.invoke(
      {} as never,
      JSON.stringify({ customer_id: "cus_001" })
    );

    expect(JSON.parse(String(result))).toMatchObject({
      ok: false,
      error: {
        code: "IDENTITY_NOT_RESOLVED",
        policy_id: "P001_IDENTITY_UNCERTAIN"
      }
    });
    const summary = traceCollector.summarize(toolContext.run_id);
    expect(summary.audit_ids).toHaveLength(1);
    expect(summary.tool_calls[0]?.audit_event_ids).toHaveLength(1);
    expect(summary.tool_calls).toMatchObject([
      {
        tool_name: "get_customer_state",
        status: "blocked",
        policy_id: "P001_IDENTITY_UNCERTAIN",
        audit_event_ids: expect.any(Array)
      }
    ]);
  });

  it("supports eval-only authenticated session state for tools", async () => {
    const sessionState = createRealtimeSessionState({
      identity_status: "confirmed",
      resolved_customer_id: "cus_001"
    });
    const base = createRealtimeToolContextBase({
      lastUserMessage: "Please read my current subscription.",
      now: () => new Date("2026-05-11T10:00:00Z"),
      runId: "run_seeded_identity",
      sessionId: "realtime_eval_seeded_identity",
      userTurnId: "turn_seeded_identity"
    });
    const sdkTools = createRealtimeAgentSdkTools({
      registry: createMealPlanToolRegistry(),
      sessionState,
      getToolContext: () =>
        buildRealtimeToolContext({ base, state: sessionState })
    });
    const getCustomerState = sdkTools.find(
      (sdkTool) => sdkTool.name === "get_customer_state"
    );

    const result = await getCustomerState?.invoke(
      {} as never,
      JSON.stringify({ customer_id: "cus_001" })
    );

    expect(JSON.parse(String(result))).toMatchObject({
      ok: true,
      data: {
        customer: {
          customer_id: "cus_001"
        }
      }
    });
  });

  it("keeps the SDK session configured for server-side websocket runner use", async () => {
    const options = createRealtimeSessionFactoryOptions({
      model: "gpt-realtime-2",
      traceGroupId: "realtime_crawl_group",
      traceMetadata: { case_id: "customer_identity_lookup" },
      workflowName: "MealPlan VoiceOps Realtime Crawl Eval"
    });
    const agent = createMealPlanRealtimeAgent({
      getToolContext: () => toolContext
    });

    expect(options.transport).toBe("websocket");
    expect(options.tracingDisabled).toBe(false);
    expect(options.workflowName).toBe("MealPlan VoiceOps Realtime Crawl Eval");
    expect(options.groupId).toBe("realtime_crawl_group");
    expect(options.traceMetadata).toMatchObject({ case_id: "customer_identity_lookup" });
    expect(options.config.outputModalities).toEqual(["text"]);
    expect(options.config.audio.input.turnDetection).toBeNull();
    expect(agent.tools?.map((sdkTool) => sdkTool.name)).toContain("lookup_customer");
  });

  it("skips the smoke runner cleanly when credentials are missing", async () => {
    const sessionFactory = vi.fn();
    const result = await runRealtimeAgentSmoke({
      env: {},
      runId: "run_no_key",
      sessionId: "session_no_key",
      sessionFactory
    });

    expect(result).toMatchObject({
      status: "skipped",
      reason: "missing_openai_api_key",
      platform_tracing: { enabled: true },
      transport: REALTIME_RUNNER_TRANSPORT
    });
    expect(sessionFactory).not.toHaveBeenCalled();
  });

  it("streams an audio fixture in chunks through an injected SDK session boundary", async () => {
    const fakeSession = new FakeRealtimeSession();
    const audio = new ArrayBuffer(2_000);
    const result = await runRealtimeAgentSmoke({
      apiKey: "sk-test",
      audio,
      audioChunkDurationMs: 20,
      runId: "run_audio",
      sessionId: "session_audio",
      sessionFactory: () => fakeSession,
      traceMetadata: {
        attempt: 1,
        case_id: "customer_identity_lookup",
        oob_transcription: true
      }
    });

    expect(result.status).toBe("completed");
    expect(fakeSession.connect).toHaveBeenCalledWith({ apiKey: "sk-test" });
    expect(result.platform_tracing).toMatchObject({
      enabled: true,
      group_id: "run_audio",
      metadata: {
        attempt: "1",
        case_id: "customer_identity_lookup",
        oob_transcription: "true"
      },
      workflow_name: "MealPlan VoiceOps Realtime Eval"
    });
    expect(fakeSession.sendAudio).toHaveBeenCalledTimes(3);
    expect(fakeSession.sendAudio).toHaveBeenNthCalledWith(
      1,
      expect.any(ArrayBuffer),
      { commit: false }
    );
    expect(fakeSession.sendAudio).toHaveBeenNthCalledWith(
      3,
      expect.any(ArrayBuffer),
      { commit: true }
    );
    expect(fakeSession.transport.requestResponse).toHaveBeenCalledOnce();
    expect(fakeSession.close).toHaveBeenCalledOnce();
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        type: "audio_stream_sent",
        payload: expect.objectContaining({
          chunk_count: 3,
          chunk_duration_ms: 20
        })
      })
    );
    expect(result.trace.map((event) => event.type)).toContain("response.done");
  });

  it("can disable platform tracing for sensitive realtime runs", async () => {
    const fakeSession = new FakeRealtimeSession();
    const result = await runRealtimeAgentSmoke({
      apiKey: "sk-test",
      env: { OPENAI_REALTIME_DISABLE_TRACING: "1" },
      runId: "run_private",
      sessionFactory: (_agent, options) => {
        expect(options.tracingDisabled).toBe(true);
        expect(options.workflowName).toBeUndefined();
        expect(options.groupId).toBeUndefined();
        return fakeSession;
      }
    });

    expect(result.platform_tracing).toEqual({ enabled: false });
  });

});
