import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMealPlanRealtimeAgent,
  createPcm16Silence,
  createRealtimeAgentSdkTools,
  createRealtimeSessionFactoryOptions,
  REALTIME_RUNNER_TRANSPORT,
  resolveOpenAIRealtimeCredentials,
  runRealtimeAgentSmoke,
  type RealtimeSessionLike
} from "../src/agent";
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
    const sdkTools = createRealtimeAgentSdkTools({
      registry,
      getToolContext: () => toolContext
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

  it("sends an audio fixture through an injected SDK session boundary", async () => {
    const fakeSession = new FakeRealtimeSession();
    const audio = createPcm16Silence({ durationMs: 100 });
    const result = await runRealtimeAgentSmoke({
      apiKey: "sk-test",
      audio,
      runId: "run_audio",
      sessionId: "session_audio",
      sessionFactory: () => fakeSession
    });

    expect(result.status).toBe("completed");
    expect(fakeSession.connect).toHaveBeenCalledWith({ apiKey: "sk-test" });
    expect(fakeSession.sendAudio).toHaveBeenCalledWith(audio, { commit: true });
    expect(fakeSession.transport.requestResponse).toHaveBeenCalledOnce();
    expect(fakeSession.close).toHaveBeenCalledOnce();
    expect(result.trace.map((event) => event.type)).toContain("response.done");
  });
});
