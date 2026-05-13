import type { RealtimeEvalCase } from "./caseLoader";
import { synthesizeOpenAiSpeechPcm } from "./tts";

export type PreparedRealtimeInput = {
  audio?: ArrayBuffer;
  audio_metadata?: Record<string, unknown>;
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

  const audio = options.apiKey
    ? await synthesizeOpenAiSpeechPcm({
      apiKey: options.apiKey,
      input: options.realtimeCase.input.text,
      model: options.realtimeCase.audio.model,
      voice: options.realtimeCase.audio.voice,
      instructions: options.realtimeCase.audio.instructions,
      speed: options.realtimeCase.audio.speed
    })
    : undefined;

  return {
    audio,
    input_mode: "audio",
    input_text: options.realtimeCase.input.text,
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
      byte_length: audio?.byteLength
    }
  };
}
