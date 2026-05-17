import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRealtimeControlRequest } from "../src/app/api/realtime/control/handler";
import type { RealtimeSidebandSocket } from "../src/realtime/server/serverControl";

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

  emit(eventName: string): void {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler();
    }
  }
}

const originalApiKey = process.env.OPENAI_API_KEY;
const originalRouteToken = process.env.MEALPLAN_REALTIME_ROUTE_TOKEN;

function jsonRequest(body: unknown, token = "test-route-token"): Request {
  return new Request("http://localhost/api/realtime/control", {
    method: "POST",
    headers: { "x-mealplan-realtime-token": token },
    body: JSON.stringify(body)
  });
}

describe("POST /api/realtime/control", () => {
  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalRouteToken === undefined) {
      delete process.env.MEALPLAN_REALTIME_ROUTE_TOKEN;
    } else {
      process.env.MEALPLAN_REALTIME_ROUTE_TOKEN = originalRouteToken;
    }
    vi.restoreAllMocks();
  });

  it("rejects requests with missing route token", async () => {
    process.env.OPENAI_API_KEY = "sk-server-secret";
    process.env.MEALPLAN_REALTIME_ROUTE_TOKEN = "test-route-token";

    const response = await handleRealtimeControlRequest(
      new Request("http://localhost/api/realtime/control", {
        method: "POST",
        body: JSON.stringify({ call_id: "rtc_test_123456" })
      })
    );

    expect(response.status).toBe(401);
  });

  it("rejects invalid call IDs without opening a socket", async () => {
    process.env.OPENAI_API_KEY = "sk-server-secret";
    process.env.MEALPLAN_REALTIME_ROUTE_TOKEN = "test-route-token";
    const socketFactory = vi.fn(() => new FakeSidebandSocket());

    const response = await handleRealtimeControlRequest(
      jsonRequest({ call_id: "bad" }),
      { socketFactory }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain("Invalid Realtime call_id");
    expect(socketFactory).not.toHaveBeenCalled();
  });

  it("returns a clear server error when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.MEALPLAN_REALTIME_ROUTE_TOKEN = "test-route-token";
    const socketFactory = vi.fn(() => new FakeSidebandSocket());

    const response = await handleRealtimeControlRequest(
      jsonRequest({ call_id: "rtc_test_123456" }),
      { socketFactory }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toContain("OPENAI_API_KEY");
    expect(socketFactory).not.toHaveBeenCalled();
  });

  it("starts server controls without returning tools or API keys", async () => {
    process.env.OPENAI_API_KEY = "sk-server-secret";
    process.env.MEALPLAN_REALTIME_ROUTE_TOKEN = "test-route-token";
    const socket = new FakeSidebandSocket();
    const socketFactory = vi.fn(() => socket);

    const response = await handleRealtimeControlRequest(
      jsonRequest({ call_id: "rtc_test_123456" }),
      { socketFactory }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      call_id: "rtc_test_123456",
      control_id: "rt_control_rtc_test_123456",
      status: "connecting",
      server_controls: {
        mode: "sideband",
        tools: "server_side_only",
        function_outputs: "server_side_only"
      }
    });
    expect(JSON.stringify(body)).not.toContain("sk-server-secret");
    expect(JSON.stringify(body)).not.toContain("lookup_customer");

    socket.emit("open");
    expect(JSON.parse(socket.sent[0] ?? "{}")).toMatchObject({
      type: "session.update"
    });
  });
});
