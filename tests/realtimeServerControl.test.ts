import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRealtimeServerControl,
  startRealtimeServerControl,
  type RealtimeSidebandSocket
} from "../src/realtime/server/serverControl";
import { OPENAI_REALTIME_SIDEBAND_URL } from "../src/realtime/server/sidebandUrl";
import { resetDb } from "../src/domain/db";
import { mealPlanRealtimeTools } from "../src/realtime/config/tools";

class FakeSidebandSocket implements RealtimeSidebandSocket {
  readonly sent: string[] = [];
  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  on(eventName: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  emit(eventName: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(...args);
    }
  }
}

function readSent(socket: FakeSidebandSocket): unknown[] {
  return socket.sent.map((item) => JSON.parse(item) as unknown);
}

describe("Realtime server sideband control", () => {
  beforeEach(() => {
    resetDb();
  });

  it("opens the sideband socket with server credentials and no browser tools", () => {
    const socket = new FakeSidebandSocket();
    const socketFactory = vi.fn(() => socket);

    const response = startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_open_123456",
      socketFactory
    });

    expect(socketFactory).toHaveBeenCalledWith(
      `${OPENAI_REALTIME_SIDEBAND_URL}?call_id=rtc_open_123456`,
      { headers: { Authorization: "Bearer sk-server-secret" } }
    );
    expect(response).toMatchObject({
      call_id: "rtc_open_123456",
      control_id: "rt_control_rtc_open_123456",
      server_controls: {
        mode: "sideband",
        tools: "server_side_only",
        function_outputs: "server_side_only",
        tool_count: mealPlanRealtimeTools.length
      }
    });
    expect(JSON.stringify(response)).not.toContain("sk-server-secret");
    expect(JSON.stringify(response)).not.toContain("lookup_customer");
  });

  it("can attach to a sideband URL derived from the SDP Location host", () => {
    const socket = new FakeSidebandSocket();
    const socketFactory = vi.fn(() => socket);

    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_regional_123456",
      sidebandUrl: "wss://eu.api.openai.com/v1/realtime?call_id=rtc_regional_123456",
      socketFactory
    });

    expect(socketFactory).toHaveBeenCalledWith(
      "wss://eu.api.openai.com/v1/realtime?call_id=rtc_regional_123456",
      { headers: { Authorization: "Bearer sk-server-secret" } }
    );
  });

  it("returns the existing control when the same call ID is attached twice", () => {
    const firstSocket = new FakeSidebandSocket();
    const secondSocket = new FakeSidebandSocket();
    const firstSocketFactory = vi.fn(() => firstSocket);
    const secondSocketFactory = vi.fn(() => secondSocket);

    const firstResponse = startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_idempotent_123456",
      socketFactory: firstSocketFactory
    });
    const secondResponse = startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_idempotent_123456",
      socketFactory: secondSocketFactory
    });

    expect(secondResponse).toEqual(firstResponse);
    expect(firstSocketFactory).toHaveBeenCalledOnce();
    expect(secondSocketFactory).not.toHaveBeenCalled();
    expect(getRealtimeServerControl("rtc_idempotent_123456")?.socket).toBe(
      firstSocket
    );
  });

  it("sends MealPlan tools and instructions from the server on open", () => {
    const socket = new FakeSidebandSocket();
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_session_123456",
      socketFactory: () => socket
    });

    socket.emit("open");

    const [sessionUpdate] = readSent(socket);
    expect(sessionUpdate).toMatchObject({
      type: "session.update",
      session: {
        type: "realtime",
        parallel_tool_calls: false,
        tools: expect.any(Array)
      }
    });
    expect(
      (sessionUpdate as { session: { tools: { name: string }[] } }).session
        .tools.map((tool) => tool.name)
    ).toContain("lookup_customer");
  });

  it("tracks and clears active controls on close", () => {
    const socket = new FakeSidebandSocket();
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_close_123456",
      socketFactory: () => socket
    });

    expect(getRealtimeServerControl("rtc_close_123456")).toMatchObject({
      control_id: "rt_control_rtc_close_123456"
    });

    socket.emit("close");

    expect(getRealtimeServerControl("rtc_close_123456")).toBeUndefined();
  });

  it("executes each Realtime function call ID once through the server registry", async () => {
    const socket = new FakeSidebandSocket();
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_tools_123456",
      now: () => new Date("2026-05-11T10:00:00Z"),
      socketFactory: () => socket
    });

    const functionCallEvent = JSON.stringify({
      type: "response.done",
      response: {
        output: [{
          type: "function_call",
          name: "lookup_customer",
          call_id: "call_lookup_customer",
          arguments: JSON.stringify({ customer_id: "cus_001" })
        }]
      }
    });
    socket.emit("message", functionCallEvent);
    socket.emit("message", functionCallEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const sent = readSent(socket);
    const responseCreates = sent.filter((item) => {
      return (
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "response.create"
      );
    });
    expect(responseCreates).toEqual([{
      type: "response.create",
      response: { output_modalities: ["audio"] }
    }]);
    const output = sent.find((item): item is {
      item: { output: string; type: string };
      type: string;
    } => {
      return (
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "conversation.item.create"
      );
    });
    expect(output?.item.type).toBe("function_call_output");
    expect(sent.filter((item) => {
      return (
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "conversation.item.create"
      );
    })).toHaveLength(1);
    expect(JSON.parse(output?.item.output ?? "{}")).toMatchObject({
      ok: true,
      data: {
        identity_status: "confirmed",
        candidate_count: 1
      }
    });
  });

  it("waits for response completion before executing function calls", async () => {
    const socket = new FakeSidebandSocket();
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_finalized_123456",
      now: () => new Date("2026-05-11T10:00:00Z"),
      socketFactory: () => socket
    });

    socket.emit("message", JSON.stringify({
      type: "response.output_item.added",
      item: {
        type: "function_call",
        name: "lookup_customer",
        call_id: "call_lookup_customer_added",
        arguments: ""
      }
    }));
    socket.emit("message", JSON.stringify({
      type: "response.function_call_arguments.done",
      name: "lookup_customer",
      call_id: "call_lookup_customer_added",
      arguments: JSON.stringify({ customer_id: "cus_001" })
    }));
    socket.emit("message", JSON.stringify({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        name: "lookup_customer",
        call_id: "call_lookup_customer_added",
        arguments: JSON.stringify({ customer_id: "cus_001" })
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(readSent(socket)).toEqual([]);

    socket.emit("message", JSON.stringify({
      type: "response.done",
      response: {
        output: [{
          type: "function_call",
          name: "lookup_customer",
          call_id: "call_lookup_customer_added",
          arguments: JSON.stringify({ customer_id: "cus_001" })
        }]
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const sent = readSent(socket);
    expect(sent.filter((item) => {
      return (
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "conversation.item.create"
      );
    })).toHaveLength(1);
    expect(JSON.stringify(sent)).toContain("confirmed");
  });

  it("rejects invalid call IDs and missing API keys before opening a socket", () => {
    const socketFactory = vi.fn(() => new FakeSidebandSocket());

    expect(() =>
      startRealtimeServerControl({
        apiKey: "sk-server-secret",
        callId: "not-a-call-id",
        socketFactory
      })
    ).toThrow("Invalid Realtime call_id");
    expect(() =>
      startRealtimeServerControl({
        callId: "rtc_missing_123456",
        socketFactory
      })
    ).toThrow("Missing OPENAI_API_KEY");
    expect(socketFactory).not.toHaveBeenCalled();
  });
});
