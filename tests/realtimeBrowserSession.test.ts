import { describe, expect, it, vi } from "vitest";
import {
  createBrowserRealtimeSessionConfig,
  createServerRealtimeSessionUpdate,
  mintBrowserRealtimeSession,
  OPENAI_REALTIME_CALLS_URL,
  OPENAI_REALTIME_CLIENT_SECRETS_URL,
  REALTIME_BROWSER_TRANSPORT
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
        audio: { output: { voice: "alloy" } },
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

  it("mints a browser-safe ephemeral session through the OpenAI server API", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        value: "ek_test_browser_secret",
        expires_at: 1_785_000_000
      })
    }));

    const session = await mintBrowserRealtimeSession({
      env: {
        MEALPLAN_REALTIME_SAFETY_IDENTIFIER: "hashed-demo-user",
        OPENAI_API_KEY: "sk-server-secret",
        OPENAI_REALTIME_MODEL: "gpt-realtime-2"
      },
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const calls = fetchImpl.mock.calls as unknown as [
      string,
      {
        body: string;
        headers: Record<string, string>;
        method: "POST";
      }
    ][];
    const [url, init] = calls[0] ?? [];
    expect(url).toBe(OPENAI_REALTIME_CLIENT_SECRETS_URL);
    expect(init?.headers.Authorization).toBe("Bearer sk-server-secret");
    expect(init?.headers["OpenAI-Safety-Identifier"]).toBe("hashed-demo-user");
    expect(init?.body).not.toContain("sk-server-secret");
    expect(init?.body).not.toContain("\"tools\"");
    expect(session).toEqual({
      client_secret: {
        value: "ek_test_browser_secret",
        expires_at: 1_785_000_000
      },
      model: "gpt-realtime-2",
      transport: {
        type: REALTIME_BROWSER_TRANSPORT,
        calls_url: OPENAI_REALTIME_CALLS_URL
      },
      server_controls: {
        mode: "sideband_required",
        tools: "server_side_only",
        tool_count: mealPlanRealtimeTools.length
      }
    });
    expect(JSON.stringify(session)).not.toContain("sk-server-secret");
  });

  it("also accepts nested client secret responses from the API", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        client_secret: { value: "ek_test_nested_secret" }
      })
    }));

    await expect(
      mintBrowserRealtimeSession({
        env: { OPENAI_API_KEY: "sk-server-secret" },
        fetchImpl
      })
    ).resolves.toMatchObject({
      client_secret: { value: "ek_test_nested_secret" }
    });
  });

  it("fails clearly before calling OpenAI when the server API key is missing", async () => {
    const fetchImpl = vi.fn();

    await expect(
      mintBrowserRealtimeSession({ env: {}, fetchImpl })
    ).rejects.toThrow("Missing OPENAI_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
