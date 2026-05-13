import type { RealtimeEvalCase } from "./caseLoader";
import { synthesizeOpenAiSpeechPcm } from "./tts";
import {
  applyWalkAudioProfile,
  type WalkAudioProfileMetadata
} from "./walkAudioProfiles";

export type PreparedRealtimeInput = {
  audio?: ArrayBuffer;
  audio_metadata?: Record<string, unknown>;
  clean_audio?: ArrayBuffer;
  walk_profile?: WalkAudioProfileMetadata;
  input_mode: "audio" | "text";
  input_text: string;
  inputText?: string;
};

export async function prepareRealtimeInput(options: {
  apiKey?: string;
  realtimeCase: RealtimeEvalCase;
}): Promise<PreparedRealtimeInput> {
  if (options.realtimeCase.input.mode === "text") {
    return {
      input_mode: "text",
      input_text: options.realtimeCase.input.text,
      inputText: options.realtimeCase.input.text
    };
  }

  const cleanAudio = options.apiKey
    ? await synthesizeOpenAiSpeechPcm({
      apiKey: options.apiKey,
      input: options.realtimeCase.input.text,
      model: options.realtimeCase.audio.model,
      voice: options.realtimeCase.audio.voice,
      instructions: options.realtimeCase.audio.instructions,
      speed: options.realtimeCase.audio.speed
    })
    : undefined;
  const profiledAudio = cleanAudio && options.realtimeCase.audio.walk_profile
    ? applyWalkAudioProfile({
      audio: cleanAudio,
      profile: options.realtimeCase.audio.walk_profile,
      sampleRateHz: options.realtimeCase.audio.sample_rate_hz
    })
    : undefined;
  const audio = profiledAudio?.audio ?? cleanAudio;

  return {
    audio,
    clean_audio: cleanAudio,
    input_mode: "audio",
    input_text: options.realtimeCase.input.text,
    walk_profile: profiledAudio?.metadata,
    audio_metadata: {
      source: options.realtimeCase.audio.source,
      fixture_mode: options.realtimeCase.audio.fixture_mode,
      stable_for_gating: options.realtimeCase.audio.stable_for_gating,
      model: options.realtimeCase.audio.model,
      voice: options.realtimeCase.audio.voice,
      response_format: options.realtimeCase.audio.response_format,
      sample_rate_hz: options.realtimeCase.audio.sample_rate_hz,
      chunk_duration_ms: options.realtimeCase.audio.chunk_duration_ms,
      expected_duration_ms: options.realtimeCase.audio.expected_duration_ms,
      walk_profile: profiledAudio?.metadata,
      byte_length: audio?.byteLength
    }
  };
}
