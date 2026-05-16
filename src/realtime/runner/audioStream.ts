import type { RealtimeSessionLike } from "./types";
import { REALTIME_RUNTIME_CONFIG } from "../config/runtimeConfig";

export type Pcm16AudioStreamOptions = {
  chunkDurationMs?: number;
  sampleRateHz?: number;
};

export type Pcm16AudioStreamSummary = {
  byte_length: number;
  bytes_per_chunk: number;
  chunk_count: number;
  chunk_duration_ms: number;
  sample_rate_hz: number;
};

export function pcm16BytesPerChunk(options: Pcm16AudioStreamOptions = {}): number {
  const sampleRateHz = options.sampleRateHz ??
    REALTIME_RUNTIME_CONFIG.evalReplay.inputAudio.sampleRateHz;
  const chunkDurationMs = options.chunkDurationMs ??
    REALTIME_RUNTIME_CONFIG.evalReplay.chunkDurationMs;
  const bytes = Math.max(2, Math.round((sampleRateHz * 2 * chunkDurationMs) / 1000));
  return bytes % 2 === 0 ? bytes : bytes + 1;
}

export function splitPcm16AudioChunks(
  audio: ArrayBuffer,
  options: Pcm16AudioStreamOptions = {}
): ArrayBuffer[] {
  const bytesPerChunk = pcm16BytesPerChunk(options);
  if (audio.byteLength === 0) return [audio];

  const chunks: ArrayBuffer[] = [];
  for (let offset = 0; offset < audio.byteLength; offset += bytesPerChunk) {
    chunks.push(audio.slice(offset, Math.min(offset + bytesPerChunk, audio.byteLength)));
  }
  return chunks;
}

export function streamPcm16AudioToRealtimeSession(
  session: RealtimeSessionLike,
  audio: ArrayBuffer,
  options: Pcm16AudioStreamOptions = {}
): Pcm16AudioStreamSummary {
  const sampleRateHz = options.sampleRateHz ??
    REALTIME_RUNTIME_CONFIG.evalReplay.inputAudio.sampleRateHz;
  const chunkDurationMs = options.chunkDurationMs ??
    REALTIME_RUNTIME_CONFIG.evalReplay.chunkDurationMs;
  const bytesPerChunk = pcm16BytesPerChunk({ chunkDurationMs, sampleRateHz });
  const chunks = splitPcm16AudioChunks(audio, { chunkDurationMs, sampleRateHz });

  chunks.forEach((chunk, index) => {
    session.sendAudio(chunk, { commit: index === chunks.length - 1 });
  });
  session.transport?.requestResponse?.();

  return {
    byte_length: audio.byteLength,
    bytes_per_chunk: bytesPerChunk,
    chunk_count: chunks.length,
    chunk_duration_ms: chunkDurationMs,
    sample_rate_hz: sampleRateHz
  };
}
