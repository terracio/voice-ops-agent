import { createHash } from "node:crypto";
import { buildRealtimeSidebandUrlFromLocation } from "./realtimeSidebandUrl";
import {
  DEFAULT_OPENAI_REALTIME_REASONING_EFFORT,
  MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
  resolveOpenAIRealtimeModel,
  type RealtimeModelEnv
} from "./realtimeInstructions";
import { mealPlanRealtimeTools, type RealtimeFunctionTool } from "./realtimeTools";

export const OPENAI_REALTIME_CALLS_URL =
  "https://api.openai.com/v1/realtime/calls";

const DEFAULT_BROWSER_VOICE = "alloy";
const DEFAULT_INPUT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_NOISE_REDUCTION_TYPE = "far_field";
const DEFAULT_SAFETY_IDENTIFIER = "mealplan-voiceops-local-demo";
const REALTIME_TRACE_GROUP_ID = "mealplan-voiceops-browser";
const REALTIME_TRACE_WORKFLOW_NAME = "MealPlan VoiceOps Browser Realtime";

type SdpFetchLike = (
  input: string,
  init: {
    body: FormData;
    headers: Record<string, string>;
    method: "POST";
  }
) => Promise<Pick<Response, "headers" | "ok" | "status" | "statusText" | "text">>;

export type RealtimeBrowserSessionEnv = RealtimeModelEnv & {
  MEALPLAN_REALTIME_SAFETY_IDENTIFIER?: string;
  MEALPLAN_REALTIME_NOISE_REDUCTION?: string;
  OPENAI_API_KEY?: string;
};

export type BrowserRealtimeSdpExchange = {
  answer_sdp: string;
  call_id: string;
  location: string;
  sideband_url: string;
};

export type ServerRealtimeSessionUpdate = {
  type: "session.update";
  session: {
    audio: ReturnType<typeof createRealtimeAudioConfig>;
    instructions: string;
    parallel_tool_calls: false;
    reasoning: { effort: typeof DEFAULT_OPENAI_REALTIME_REASONING_EFFORT };
    tools: RealtimeFunctionTool[];
    type: "realtime";
  };
};

export function createRealtimeTracingConfig(options: {
  model: string;
}): Record<string, unknown> {
  return {
    workflow_name: REALTIME_TRACE_WORKFLOW_NAME,
    group_id: REALTIME_TRACE_GROUP_ID,
    metadata: {
      app: "mealplan-voiceops",
      model: options.model,
      prompt_sha256: createHash("sha256")
        .update(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS)
        .digest("hex"),
      prompt_source: "src/agent/realtimeInstructions.md",
      surface: "browser-demo",
      tool_count: String(mealPlanRealtimeTools.length)
    }
  };
}

export function createBrowserRealtimeSessionConfig(options: {
  model: string;
}): Record<string, unknown> {
  return {
    session: {
      type: "realtime",
      model: options.model,
      instructions: MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
      audio: createRealtimeAudioConfig(),
      reasoning: {
        effort: DEFAULT_OPENAI_REALTIME_REASONING_EFFORT
      },
      tracing: createRealtimeTracingConfig({ model: options.model }),
      tools: mealPlanRealtimeTools,
      parallel_tool_calls: false
    }
  };
}

export function createBrowserRealtimeCallSession(options: {
  model: string;
}): Record<string, unknown> {
  const config = createBrowserRealtimeSessionConfig(options);
  return config.session as Record<string, unknown>;
}

export function createServerRealtimeSessionUpdate(): ServerRealtimeSessionUpdate {
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
      audio: createRealtimeAudioConfig(),
      tools: mealPlanRealtimeTools,
      reasoning: { effort: DEFAULT_OPENAI_REALTIME_REASONING_EFFORT },
      parallel_tool_calls: false
    }
  };
}

function createRealtimeAudioConfig() {
  const noiseReductionType = resolveNoiseReductionType({
    MEALPLAN_REALTIME_NOISE_REDUCTION:
      process.env.MEALPLAN_REALTIME_NOISE_REDUCTION
  });
  return {
    input: {
      noise_reduction: noiseReductionType
        ? { type: noiseReductionType }
        : null,
      transcription: {
        language: "en",
        model: DEFAULT_INPUT_TRANSCRIPTION_MODEL
      }
    },
    output: {
      voice: DEFAULT_BROWSER_VOICE
    }
  };
}

function resolveNoiseReductionType(
  env: { MEALPLAN_REALTIME_NOISE_REDUCTION?: string | undefined }
) {
  const configured = env.MEALPLAN_REALTIME_NOISE_REDUCTION?.trim();
  if (configured === "near_field" || configured === "far_field") {
    return configured;
  }
  if (configured === "off" || configured === "none" || configured === "disabled") {
    return null;
  }
  return DEFAULT_NOISE_REDUCTION_TYPE;
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
    throw new Error("Missing OPENAI_API_KEY for Realtime call creation.");
  }
  return apiKey;
}

export async function exchangeBrowserRealtimeSdpOffer(options: {
  env?: RealtimeBrowserSessionEnv;
  fetchImpl?: SdpFetchLike;
  offerSdp: string;
}): Promise<BrowserRealtimeSdpExchange> {
  const env = options.env ?? {
    MEALPLAN_REALTIME_SAFETY_IDENTIFIER:
      process.env.MEALPLAN_REALTIME_SAFETY_IDENTIFIER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL
  };
  const model = resolveOpenAIRealtimeModel(env);
  const apiKey = resolveApiKey(env);
  const form = new FormData();
  form.set("sdp", options.offerSdp);
  form.set("session", JSON.stringify(createBrowserRealtimeCallSession({ model })));

  const response = await (options.fetchImpl ?? fetch)(OPENAI_REALTIME_CALLS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Safety-Identifier": resolveSafetyIdentifier(env)
    },
    body: form
  });
  const answerSdp = await response.text();
  if (!response.ok) {
    throw new Error(
      formatSdpExchangeError({
        body: answerSdp,
        status: response.status,
        statusText: response.statusText
      })
    );
  }
  const location = response.headers.get("Location") ?? "";
  const callId = parseRealtimeCallIdFromLocation(location);
  return {
    answer_sdp: answerSdp,
    call_id: callId,
    location,
    sideband_url: buildRealtimeSidebandUrlFromLocation({ callId, location })
  };
}

function formatSdpExchangeError(options: {
  body: string;
  status: number;
  statusText: string;
}): string {
  const detail = options.body.trim().replace(/\s+/g, " ").slice(0, 600);
  return [
    `OpenAI Realtime SDP exchange failed with ${options.status} ${options.statusText}.`,
    detail ? `Response: ${detail}` : undefined
  ].filter(Boolean).join(" ");
}

function parseRealtimeCallIdFromLocation(location: string): string {
  const callId = location.match(/(?:^|[/=])(rtc_[A-Za-z0-9_-]+)/)?.[1];
  if (!callId) {
    throw new Error("Realtime call id was missing from the SDP response.");
  }
  return callId;
}
