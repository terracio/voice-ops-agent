import { describe, expect, it, vi } from "vitest";
import {
  createBrowserRealtimeSessionConfig,
  exchangeBrowserRealtimeSdpOffer,
  createServerRealtimeSessionUpdate,
  OPENAI_REALTIME_CALLS_URL
} from "../src/agent";
import { mealPlanRealtimeTools } from "../src/agent/realtimeTools";

describe("Realtime browser session boundary", () => {
  it("builds a browser session config without client-side tools", () => {
    const config = createBrowserRealtimeSessionConfig({
      model: "gpt-realtime-2"
    });

    expect(config).toMatchObject({
      session: {
        type: "realtime",
        model: "gpt-realtime-2",
        audio: {
          input: {
            transcription: {
              language: "en",
              model: "gpt-4o-mini-transcribe"
            }
          },
          output: { voice: "alloy" }
        },
        reasoning: { effort: "low" }
      }
    });
    expect(JSON.stringify(config)).toContain("MealPlan VoiceOps");
    expect(JSON.stringify(config)).not.toContain("\"tools\"");
    expect(JSON.stringify(config)).not.toContain("OPENAI_API_KEY");
  });

  it("keeps the realtime tool definitions in a server-side session update", () => {
    const update = createServerRealtimeSessionUpdate();

    expect(update).toMatchObject({
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          input: {
            transcription: {
              language: "en",
              model: "gpt-4o-mini-transcribe"
            }
          }
        },
        parallel_tool_calls: false,
        reasoning: { effort: "low" }
      }
    });
    expect(update.session.tools.map((tool) => tool.name)).toEqual(
      mealPlanRealtimeTools.map((tool) => tool.name)
    );
    expect(update.session.tools.map((tool) => tool.name)).toContain(
      "lookup_customer"
    );
  });

  it("exchanges browser SDP through the server-owned Realtime call API", async () => {
    const headers = new Headers({
      Location: "https://api.openai.com/v1/realtime/calls/rtc_exchange_123456"
    });
    const fetchImpl = vi.fn(async (_url, init) => {
      const session = String(init.body.get("session"));
      expect(session).toContain("gpt-realtime-2");
      expect(session).not.toContain("\"tools\"");
      return {
        headers,
        ok: true,
        status: 201,
        statusText: "Created",
        text: async () => "v=0\r\ns=openai-answer"
      };
    });

    const exchange = await exchangeBrowserRealtimeSdpOffer({
      env: {
        MEALPLAN_REALTIME_SAFETY_IDENTIFIER: "hashed-demo-user",
        OPENAI_API_KEY: "sk-server-secret",
        OPENAI_REALTIME_MODEL: "gpt-realtime-2"
      },
      fetchImpl,
      offerSdp: "v=0\r\ns=browser-offer"
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      OPENAI_REALTIME_CALLS_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-server-secret",
          "OpenAI-Safety-Identifier": "hashed-demo-user"
        }),
        method: "POST"
      })
    );
    expect(exchange).toEqual({
      answer_sdp: "v=0\r\ns=openai-answer",
      call_id: "rtc_exchange_123456",
      location: "https://api.openai.com/v1/realtime/calls/rtc_exchange_123456",
      sideband_url: "wss://api.openai.com/v1/realtime?call_id=rtc_exchange_123456"
    });
  });

  it("fails clearly before calling OpenAI when the server API key is missing", async () => {
    const fetchImpl = vi.fn();

    await expect(
      exchangeBrowserRealtimeSdpOffer({
        env: {},
        fetchImpl,
        offerSdp: "v=0\r\ns=browser-offer"
      })
    ).rejects.toThrow("Missing OPENAI_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces OpenAI SDP exchange error details", async () => {
    const fetchImpl = vi.fn(async () => ({
      headers: new Headers(),
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "{\"error\":{\"message\":\"Invalid SDP offer\"}}"
    }));

    await expect(exchangeBrowserRealtimeSdpOffer({
      env: { OPENAI_API_KEY: "sk-server-secret" },
      fetchImpl,
      offerSdp: "v=0\r\ns=browser-offer"
    })).rejects.toThrow("Invalid SDP offer");
  });
});
