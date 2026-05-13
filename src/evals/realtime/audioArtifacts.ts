import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PCM16_BYTES_PER_SAMPLE = 2;
const PCM16_CHANNELS = 1;

export type RealtimeAudioArtifactLabel = "clean_input" | "profile_input";

export type RealtimeAudioArtifact = {
  byte_length: number;
  channels: number;
  checksum_sha256: string;
  duration_ms: number;
  encoding: "pcm16le";
  label: RealtimeAudioArtifactLabel;
  pcm_path: string;
  sample_rate_hz: number;
  wav_path: string;
};

export type RealtimeAudioArtifacts = {
  clean_input?: RealtimeAudioArtifact;
  profile_input?: RealtimeAudioArtifact;
};

export function writeRealtimeAudioArtifacts(options: {
  cleanAudio?: ArrayBuffer;
  profileAudio?: ArrayBuffer;
  reportDir: string;
  sampleRateHz: number;
}): RealtimeAudioArtifacts | undefined {
  if (!options.cleanAudio && !options.profileAudio) return undefined;

  const audioDir = join(options.reportDir, "audio");
  mkdirSync(audioDir, { recursive: true });

  const artifacts: RealtimeAudioArtifacts = {};
  if (options.cleanAudio) {
    artifacts.clean_input = writePcm16AudioArtifact({
      audio: options.cleanAudio,
      audioDir,
      label: "clean_input",
      sampleRateHz: options.sampleRateHz
    });
  }
  if (options.profileAudio) {
    artifacts.profile_input = writePcm16AudioArtifact({
      audio: options.profileAudio,
      audioDir,
      label: "profile_input",
      sampleRateHz: options.sampleRateHz
    });
  }
  return artifacts;
}

function writePcm16AudioArtifact(options: {
  audio: ArrayBuffer;
  audioDir: string;
  label: RealtimeAudioArtifactLabel;
  sampleRateHz: number;
}): RealtimeAudioArtifact {
  const pcm = Buffer.from(options.audio);
  const pcmPath = join(options.audioDir, `${options.label}.pcm`);
  const wavPath = join(options.audioDir, `${options.label}.wav`);
  const checksum = createHash("sha256").update(pcm).digest("hex");
  const durationMs = Math.round(
    (pcm.byteLength / (options.sampleRateHz * PCM16_BYTES_PER_SAMPLE * PCM16_CHANNELS)) *
      1000
  );

  writeFileSync(pcmPath, pcm);
  writeFileSync(wavPath, createPcm16WavBuffer({
    pcm,
    sampleRateHz: options.sampleRateHz
  }));

  return {
    byte_length: pcm.byteLength,
    channels: PCM16_CHANNELS,
    checksum_sha256: checksum,
    duration_ms: durationMs,
    encoding: "pcm16le",
    label: options.label,
    pcm_path: pcmPath,
    sample_rate_hz: options.sampleRateHz,
    wav_path: wavPath
  };
}

function createPcm16WavBuffer(options: {
  pcm: Buffer;
  sampleRateHz: number;
}): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = options.sampleRateHz * PCM16_CHANNELS * PCM16_BYTES_PER_SAMPLE;
  const blockAlign = PCM16_CHANNELS * PCM16_BYTES_PER_SAMPLE;

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + options.pcm.byteLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(PCM16_CHANNELS, 22);
  header.writeUInt32LE(options.sampleRateHz, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(options.pcm.byteLength, 40);

  return Buffer.concat([header, options.pcm]);
}
