import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/realtime/session/route";
import { mealPlanRealtimeTools } from "../src/agent/realtimeTools";

const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_REALTIME_MODEL;

describe("POST /api/realtime/session", () => {
  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalModel === undefined) {
      delete process.env.OPENAI_REALTIME_MODEL;
    } else {
      process.env.OPENAI_REALTIME_MODEL = originalModel;
    }
    vi.restoreAllMocks();
  });

  it("returns a clear server error when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      error: "realtime_session_unavailable",
      message: expect.stringContaining("OPENAI_API_KEY")
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns only the ephemeral credential and browser session metadata", async () => {
    process.env.OPENAI_API_KEY = "sk-server-secret";
    process.env.OPENAI_REALTIME_MODEL = "gpt-realtime-2";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ value: "ek_test_route_secret" })
    } as Response);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      client_secret: { value: "ek_test_route_secret" },
      model: "gpt-realtime-2",
      server_controls: {
        mode: "sideband_required",
        tools: "server_side_only",
        tool_count: mealPlanRealtimeTools.length
      }
    });
    expect(JSON.stringify(body)).not.toContain("sk-server-secret");
    expect(body).not.toHaveProperty("tools");
  });
});
