import { z } from "zod";
import {
  DEFAULT_OPENAI_REALTIME_REASONING_EFFORT,
  MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
  resolveOpenAIRealtimeModel,
  type RealtimeModelEnv
} from "./realtimeInstructions";
import { mealPlanRealtimeTools, type RealtimeFunctionTool } from "./realtimeTools";

export const OPENAI_REALTIME_CALLS_URL =
  "https://api.openai.com/v1/realtime/calls";
export const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
export const REALTIME_BROWSER_TRANSPORT = "webrtc";

const DEFAULT_BROWSER_VOICE = "alloy";
const DEFAULT_SAFETY_IDENTIFIER = "mealplan-voiceops-local-demo";

type FetchLike = (
  input: string,
  init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
  }
) => Promise<Pick<Response, "json" | "ok" | "status" | "statusText">>;

export type RealtimeBrowserSessionEnv = RealtimeModelEnv & {
  MEALPLAN_REALTIME_SAFETY_IDENTIFIER?: string;
  OPENAI_API_KEY?: string;
};

export type BrowserRealtimeSession = {
  client_secret: {
    expires_at?: number;
    value: string;
  };
  model: string;
  server_controls: {
    mode: "sideband_required";
    tool_count: number;
    tools: "server_side_only";
  };
  transport: {
    calls_url: typeof OPENAI_REALTIME_CALLS_URL;
    type: typeof REALTIME_BROWSER_TRANSPORT;
  };
};

export type ServerRealtimeSessionUpdate = {
  type: "session.update";
  session: {
    instructions: string;
    parallel_tool_calls: false;
    reasoning: { effort: typeof DEFAULT_OPENAI_REALTIME_REASONING_EFFORT };
    tools: RealtimeFunctionTool[];
    type: "realtime";
  };
};

const ClientSecretResponseSchema = z.object({
  expires_at: z.number().optional(),
  value: z.string().min(1)
}).passthrough();
const ClientSecretEnvelopeSchema = z.union([
  ClientSecretResponseSchema,
  z.object({ client_secret: ClientSecretResponseSchema }).passthrough()
]);
type ClientSecretResponse = z.infer<typeof ClientSecretResponseSchema>;

export function createBrowserRealtimeSessionConfig(options: {
  model: string;
}): Record<string, unknown> {
  return {
    session: {
      type: "realtime",
      model: options.model,
      instructions: MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
      audio: {
        output: {
          voice: DEFAULT_BROWSER_VOICE
        }
      },
      reasoning: {
        effort: DEFAULT_OPENAI_REALTIME_REASONING_EFFORT
      }
    }
  };
}

export function createServerRealtimeSessionUpdate(): ServerRealtimeSessionUpdate {
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
      tools: mealPlanRealtimeTools,
      reasoning: { effort: DEFAULT_OPENAI_REALTIME_REASONING_EFFORT },
      parallel_tool_calls: false
    }
  };
}

function resolveSafetyIdentifier(env: RealtimeBrowserSessionEnv): string {
  const configured = env.MEALPLAN_REALTIME_SAFETY_IDENTIFIER?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_SAFETY_IDENTIFIER;
}

function resolveApiKey(env: RealtimeBrowserSessionEnv): string {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY for Realtime session creation.");
  }
  return apiKey;
}

function normalizeClientSecretResponse(data: unknown): ClientSecretResponse {
  const parsedSecret = ClientSecretEnvelopeSchema.parse(data);
  return "client_secret" in parsedSecret
    ? ClientSecretResponseSchema.parse(parsedSecret.client_secret)
    : parsedSecret;
}

export async function mintBrowserRealtimeSession(options: {
  env?: RealtimeBrowserSessionEnv;
  fetchImpl?: FetchLike;
} = {}): Promise<BrowserRealtimeSession> {
  const env = options.env ?? {
    MEALPLAN_REALTIME_SAFETY_IDENTIFIER:
      process.env.MEALPLAN_REALTIME_SAFETY_IDENTIFIER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL
  };
  const model = resolveOpenAIRealtimeModel(env);
  const apiKey = resolveApiKey(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": resolveSafetyIdentifier(env)
    },
    body: JSON.stringify(createBrowserRealtimeSessionConfig({ model }))
  });

  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      `OpenAI Realtime session creation failed with ${response.status} ${response.statusText}.`
    );
  }

  const clientSecret = normalizeClientSecretResponse(data);

  return {
    client_secret: {
      value: clientSecret.value,
      ...(clientSecret.expires_at !== undefined
        ? { expires_at: clientSecret.expires_at }
        : {})
    },
    model,
    transport: {
      type: REALTIME_BROWSER_TRANSPORT,
      calls_url: OPENAI_REALTIME_CALLS_URL
    },
    server_controls: {
      mode: "sideband_required",
      tools: "server_side_only",
      tool_count: mealPlanRealtimeTools.length
    }
  };
}
