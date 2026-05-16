export const REALTIME_RUNTIME_CONFIG = {
  shared: {
    defaultModel: "gpt-realtime-2",
    inputTranscription: {
      language: "en",
      model: "gpt-4o-mini-transcribe"
    },
    parallelToolCalls: false,
    reasoningEffort: "low",
    voice: "alloy"
  },
  browser: {
    callsUrl: "https://api.openai.com/v1/realtime/calls",
    mediaConstraints: {
      audio: {
        autoGainControl: { ideal: true },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true }
      }
    },
    noiseReduction: {
      allowedTypes: ["near_field", "far_field"],
      defaultType: "far_field",
      disabledValues: ["off", "none", "disabled"]
    },
    safetyIdentifier: "mealplan-voiceops-local-demo",
    tracing: {
      groupId: "mealplan-voiceops-browser",
      workflowName: "MealPlan VoiceOps Browser Realtime"
    },
    turnDetection: "api_default_server_vad"
  },
  evalReplay: {
    chunkDurationMs: 20,
    fallbackSilenceDurationMs: 300,
    inputAudio: {
      format: "audio/pcm",
      sampleRateHz: 24_000
    },
    outputModalities: ["text"],
    quietMs: 1_000,
    timeoutMs: 20_000,
    tts: {
      fixtureMode: "generated_on_demand",
      model: "gpt-4o-mini-tts",
      responseFormat: "pcm",
      source: "openai_tts",
      stableForGating: false,
      voice: "alloy"
    },
    turnDetection: null
  },
  walkProfiles: {
    defaultSeed: 1701,
    names: ["walk_phone_noise_v1", "walk_uncertain_noise_v1"],
    phoneTargetSampleRateHz: 8_000,
    settings: {
      walk_phone_noise_v1: {
        snrDb: 18,
        targetSampleRateHz: 8_000
      },
      walk_uncertain_noise_v1: {
        snrDb: 10,
        targetSampleRateHz: 8_000
      }
    }
  }
} as const;

export const DEFAULT_OPENAI_REALTIME_MODEL =
  REALTIME_RUNTIME_CONFIG.shared.defaultModel;

export const DEFAULT_OPENAI_REALTIME_REASONING_EFFORT =
  REALTIME_RUNTIME_CONFIG.shared.reasoningEffort;

export const DEFAULT_REALTIME_EVAL_AUDIO_CONFIG = {
  chunk_duration_ms: REALTIME_RUNTIME_CONFIG.evalReplay.chunkDurationMs,
  fixture_mode: REALTIME_RUNTIME_CONFIG.evalReplay.tts.fixtureMode,
  model: REALTIME_RUNTIME_CONFIG.evalReplay.tts.model,
  response_format: REALTIME_RUNTIME_CONFIG.evalReplay.tts.responseFormat,
  sample_rate_hz: REALTIME_RUNTIME_CONFIG.evalReplay.inputAudio.sampleRateHz,
  source: REALTIME_RUNTIME_CONFIG.evalReplay.tts.source,
  stable_for_gating: REALTIME_RUNTIME_CONFIG.evalReplay.tts.stableForGating,
  voice: REALTIME_RUNTIME_CONFIG.evalReplay.tts.voice
} as const;

export const DEFAULT_WALK_ROBUSTNESS_PROFILE = {
  name: "walk_phone_noise_v1",
  seed: REALTIME_RUNTIME_CONFIG.walkProfiles.defaultSeed
} as const;

export type RealtimeModelEnv = {
  OPENAI_REALTIME_MODEL?: string;
};

export type RealtimeNoiseReductionEnv = {
  MEALPLAN_REALTIME_NOISE_REDUCTION?: string;
};

export type RealtimeSafetyIdentifierEnv = {
  MEALPLAN_REALTIME_SAFETY_IDENTIFIER?: string;
};

export type RealtimeNoiseReductionType =
  typeof REALTIME_RUNTIME_CONFIG.browser.noiseReduction.allowedTypes[number];

export function resolveOpenAIRealtimeModel(
  env: RealtimeModelEnv = {}
): string {
  const configuredModel = env.OPENAI_REALTIME_MODEL?.trim();
  return configuredModel && configuredModel.length > 0
    ? configuredModel
    : DEFAULT_OPENAI_REALTIME_MODEL;
}

export function resolveRealtimeNoiseReductionType(
  env: RealtimeNoiseReductionEnv
): RealtimeNoiseReductionType | null {
  const configured = env.MEALPLAN_REALTIME_NOISE_REDUCTION?.trim();
  if (
    configured &&
    isRealtimeNoiseReductionType(configured)
  ) {
    return configured;
  }
  if (
    configured &&
    REALTIME_RUNTIME_CONFIG.browser.noiseReduction.disabledValues.some(
      (value) => value === configured
    )
  ) {
    return null;
  }
  return REALTIME_RUNTIME_CONFIG.browser.noiseReduction.defaultType;
}

export function resolveRealtimeSafetyIdentifier(
  env: RealtimeSafetyIdentifierEnv
): string {
  const configured = env.MEALPLAN_REALTIME_SAFETY_IDENTIFIER?.trim();
  return configured && configured.length > 0
    ? configured
    : REALTIME_RUNTIME_CONFIG.browser.safetyIdentifier;
}

function isRealtimeNoiseReductionType(
  value: string
): value is RealtimeNoiseReductionType {
  return REALTIME_RUNTIME_CONFIG.browser.noiseReduction.allowedTypes.some(
    (allowedType) => allowedType === value
  );
}
