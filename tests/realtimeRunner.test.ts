import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMealPlanRealtimeAgent,
  createRealtimeAgentSdkTools,
  createRealtimeSessionFactoryOptions,
  createRealtimeTraceCollector,
  REALTIME_RUNNER_TRANSPORT,
  resolveOpenAIRealtimeCredentials,
  runRealtimeAgentSmoke,
  type RealtimeSessionLike
} from "../src/agent";
import { resetDb } from "../src/domain/db";
import {
  loadRealtimeEvalCase,
  REALTIME_CRAWL_CONTRACT_CASE_IDS
} from "../src/evals/realtime/caseLoader";
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

  it("keeps the SDK session configured for server-side websocket runner use", async () => {
    const options = createRealtimeSessionFactoryOptions({
      model: "gpt-realtime-2"
    });
    const agent = createMealPlanRealtimeAgent({
      getToolContext: () => toolContext
    });

    expect(options.transport).toBe("websocket");
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
      transport: REALTIME_RUNNER_TRANSPORT
    });
    expect(sessionFactory).not.toHaveBeenCalled();
  });

  it("loads the maya smoke case as a clean-audio crawl fixture", () => {
    expect(loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" }))
      .toMatchObject({
        case_id: "maya_smoke",
        stage: "crawl",
        seed_id: "maya_default",
        input: {
          mode: "audio"
        },
        audio: {
          source: "openai_tts",
          response_format: "pcm",
          sample_rate_hz: 24_000,
          chunk_duration_ms: 20
        },
        expected: {
          required_tools: ["lookup_customer"]
        }
      });
  });

  it("loads the first realtime crawl contract cases", () => {
    const cases = REALTIME_CRAWL_CONTRACT_CASE_IDS.map((caseId) =>
      loadRealtimeEvalCase({ caseId, stage: "crawl" })
    );

    expect(cases.map((realtimeCase) => realtimeCase.case_id)).toEqual([
      "maya_smoke",
      "missing_identity_asks_clarification",
      "ambiguous_date_asks_clarification",
      "allergy_change_escalates",
      "payment_settlement_forbidden"
    ]);
    for (const realtimeCase of cases) {
      expect(realtimeCase.stage).toBe("crawl");
      expect(realtimeCase.input.mode).toBe("audio");
      expect(realtimeCase.audio).toMatchObject({
        source: "openai_tts",
        fixture_mode: "generated_on_demand",
        stable_for_gating: false,
        response_format: "pcm",
        sample_rate_hz: 24_000,
        chunk_duration_ms: 20
      });
      expect(realtimeCase.expected.intent).toEqual(expect.any(String));
      expect(realtimeCase.expected.expected_final_state.changed).toBe(false);
      expect(realtimeCase.expected.required_tools).toEqual(expect.any(Array));
      expect(realtimeCase.expected.forbidden_tools).toEqual(expect.any(Array));
    }
    expect(cases[2]?.expected.expected_policy_ids).toContain("P002_AMBIGUOUS_DATE");
    expect(cases[3]?.expected.expected_policy_ids).toContain(
      "P008_MEDICAL_RISK_ESCALATION_REQUIRED"
    );
    expect(cases[4]?.expected.required_tools).toEqual([]);
    expect(cases[4]?.expected.response.should_request_confirmation).toBe(true);
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
      sessionFactory: () => fakeSession
    });

    expect(result.status).toBe("completed");
    expect(fakeSession.connect).toHaveBeenCalledWith({ apiKey: "sk-test" });
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
});
