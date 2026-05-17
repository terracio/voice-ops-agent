import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserRealtimeSessionConfig,
  createRealtimeTracingConfig,
  exchangeBrowserRealtimeSdpOffer,
  createServerRealtimeSessionUpdate,
  OPENAI_REALTIME_CALLS_URL
} from "../src/realtime/server/browserSession";
import { mealPlanRealtimeTools } from "../src/realtime/config/tools";

const originalNoiseReduction = process.env.MEALPLAN_REALTIME_NOISE_REDUCTION;

describe("Realtime browser session boundary", () => {
  afterEach(() => {
    if (originalNoiseReduction === undefined) {
      delete process.env.MEALPLAN_REALTIME_NOISE_REDUCTION;
    } else {
      process.env.MEALPLAN_REALTIME_NOISE_REDUCTION = originalNoiseReduction;
    }
  });

  it("builds a server-mediated browser session config with tools attached", () => {
    const config = createBrowserRealtimeSessionConfig({
      model: "gpt-realtime-2"
    });
    const session = config.session as Record<string, unknown>;

    expect(config).toMatchObject({
      session: {
        type: "realtime",
        model: "gpt-realtime-2",
        audio: {
          input: {
            noise_reduction: {
              type: "far_field"
            },
            transcription: {
              language: "en",
              model: "gpt-realtime-whisper"
            }
          },
          output: { voice: "marin" }
        },
        reasoning: { effort: "low" }
      }
    });
    expect(session).toMatchObject({
      tracing: {
        workflow_name: "MealPlan VoiceOps Browser Realtime",
        group_id: "mealplan-voiceops-browser",
        metadata: {
          app: "mealplan-voiceops",
          model: "gpt-realtime-2",
          prompt_source: "src/realtime/config/instructions.md",
          surface: "browser-demo",
          tool_count: String(mealPlanRealtimeTools.length)
        }
      }
    });
    expect(JSON.stringify(session.tracing)).toMatch(
      /"prompt_sha256":"[a-f0-9]{64}"/
    );
    expect(JSON.stringify(config)).toContain("MealPlan VoiceOps");
    expect(JSON.stringify(config)).toContain("\"tools\"");
    expect(JSON.stringify(config)).toContain("lookup_customer");
    expect(session).toMatchObject({
      parallel_tool_calls: false
    });
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
            noise_reduction: {
              type: "far_field"
            },
            transcription: {
              language: "en",
              model: "gpt-realtime-whisper"
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
    expect(update.session).not.toHaveProperty("tracing");
  });

  it("allows headset-oriented near-field noise reduction by env", () => {
    process.env.MEALPLAN_REALTIME_NOISE_REDUCTION = "near_field";

    expect(createServerRealtimeSessionUpdate()).toMatchObject({
      session: {
        audio: {
          input: {
            noise_reduction: {
              type: "near_field"
            }
          }
        }
      }
    });
  });

  it("allows disabling OpenAI input noise reduction by env", () => {
    const update = createServerRealtimeSessionUpdate({
      MEALPLAN_REALTIME_NOISE_REDUCTION: "off"
    });

    expect(update.session.audio.input.noise_reduction).toBeNull();
  });

  it("keeps browser Realtime trace metadata stable for Platform inspection", () => {
    const tracing = createRealtimeTracingConfig({ model: "gpt-realtime-2" });

    expect(tracing).toMatchObject({
      workflow_name: "MealPlan VoiceOps Browser Realtime",
      group_id: "mealplan-voiceops-browser",
      metadata: {
        app: "mealplan-voiceops",
        model: "gpt-realtime-2",
        prompt_source: "src/realtime/config/instructions.md",
        surface: "browser-demo",
        tool_count: String(mealPlanRealtimeTools.length)
      }
    });
    expect(String((tracing.metadata as Record<string, unknown>).prompt_sha256))
      .toMatch(/^[a-f0-9]{64}$/);
  });

  it("exchanges browser SDP through the server-owned Realtime call API", async () => {
    const headers = new Headers({
      Location: "https://api.openai.com/v1/realtime/calls/rtc_exchange_123456"
    });
    const fetchImpl = vi.fn(async (_url, init) => {
      const session = String(init.body.get("session"));
      expect(session).toContain("gpt-realtime-2");
      expect(session).toContain("MealPlan VoiceOps Browser Realtime");
      expect(session).toContain("prompt_sha256");
      expect(session).toContain("\"tools\"");
      expect(session).toContain("lookup_customer");
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
