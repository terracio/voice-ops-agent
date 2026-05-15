import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRealtimeCallRequest } from "../src/app/api/realtime/call/handler";
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
}

const originalApiKey = process.env.OPENAI_API_KEY;

describe("POST /api/realtime/call", () => {
  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    vi.restoreAllMocks();
  });

  it("creates a server-owned Realtime call and starts sideband control", async () => {
    process.env.OPENAI_API_KEY = "sk-server-secret";
    const socket = new FakeSidebandSocket();
    const socketFactory = vi.fn(() => socket);
    const fetchImpl = vi.fn(async () => new Response("v=0\r\ns=answer", {
      headers: {
        Location: "https://api.openai.com/v1/realtime/calls/rtc_route_123456"
      },
      status: 201,
      statusText: "Created"
    }));

    const response = await handleRealtimeCallRequest(
      new Request("http://localhost/api/realtime/call", {
        body: "v=0\r\ns=offer",
        method: "POST"
      }),
      { fetchImpl, socketFactory }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/sdp");
    expect(response.headers.get("X-Realtime-Call-Id")).toBe("rtc_route_123456");
    expect(await response.text()).toBe("v=0\r\ns=answer");
    expect(socketFactory).toHaveBeenCalledWith(
      "wss://api.openai.com/v1/realtime?call_id=rtc_route_123456",
      { headers: { Authorization: "Bearer sk-server-secret" } }
    );
  });

  it("fails before calling OpenAI when the API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchImpl = vi.fn();

    const response = await handleRealtimeCallRequest(
      new Request("http://localhost/api/realtime/call", {
        body: "v=0\r\ns=offer",
        method: "POST"
      }),
      { fetchImpl }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toContain("OPENAI_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
