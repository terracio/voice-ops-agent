import { createHash } from "node:crypto";
import { REALTIME_RUNTIME_CONFIG } from "../../realtime/config/runtimeConfig";

export const WALK_AUDIO_PROFILE_NAMES =
  REALTIME_RUNTIME_CONFIG.walkProfiles.names;

export type WalkAudioProfileName = typeof WALK_AUDIO_PROFILE_NAMES[number];

export type WalkAudioProfileConfig = {
  name: WalkAudioProfileName;
  seed?: number;
};

export type WalkAudioProfileTransform =
  | {
      target_sample_rate_hz: number;
      type: "phone_bandwidth";
    }
  | {
      noise: "seeded_white";
      snr_db: number;
      type: "background_noise";
    };

export type WalkAudioProfileMetadata = {
  config: Required<WalkAudioProfileConfig>;
  input_checksum_sha256: string;
  input_sample_rate_hz: number;
  output_checksum_sha256: string;
  output_sample_rate_hz: number;
  profile_name: WalkAudioProfileName;
  transforms: WalkAudioProfileTransform[];
};

export type WalkAudioProfileResult = {
  audio: ArrayBuffer;
  metadata: WalkAudioProfileMetadata;
};

const WALK_AUDIO_PROFILE_SETTINGS = REALTIME_RUNTIME_CONFIG.walkProfiles.settings;
const INT16_MIN = -32_768;
const INT16_MAX = 32_767;

export function applyWalkAudioProfile(options: {
  audio: ArrayBuffer;
  profile: WalkAudioProfileConfig;
  sampleRateHz: number;
}): WalkAudioProfileResult {
  const config = {
    name: options.profile.name,
    seed: options.profile.seed ?? REALTIME_RUNTIME_CONFIG.walkProfiles.defaultSeed
  };
  const settings = WALK_AUDIO_PROFILE_SETTINGS[config.name];
  if (!settings) {
    throw new Error(`Unsupported Walk audio profile: ${config.name}`);
  }

  const inputChecksum = checksumArrayBuffer(options.audio);
  const sourceSamples = readPcm16Samples(options.audio);
  const phoneSamples = applyPhoneBandwidth(sourceSamples, {
    sampleRateHz: options.sampleRateHz,
    targetSampleRateHz: settings.targetSampleRateHz
  });
  const outputSamples = mixSeededWhiteNoise(phoneSamples, {
    seed: config.seed,
    snrDb: settings.snrDb
  });
  const outputAudio = writePcm16Samples(outputSamples);

  return {
    audio: outputAudio,
    metadata: {
      config,
      input_checksum_sha256: inputChecksum,
      input_sample_rate_hz: options.sampleRateHz,
      output_checksum_sha256: checksumArrayBuffer(outputAudio),
      output_sample_rate_hz: options.sampleRateHz,
      profile_name: config.name,
      transforms: [
        {
          target_sample_rate_hz: settings.targetSampleRateHz,
          type: "phone_bandwidth"
        },
        {
          noise: "seeded_white",
          snr_db: settings.snrDb,
          type: "background_noise"
        }
      ]
    }
  };
}

function applyPhoneBandwidth(
  samples: Int16Array,
  options: {
    sampleRateHz: number;
    targetSampleRateHz: number;
  }
): Int16Array {
  const factor = options.sampleRateHz / options.targetSampleRateHz;
  if (!Number.isInteger(factor) || factor < 1) {
    throw new Error(
      `Phone bandwidth profile requires an integer downsample factor: ${options.sampleRateHz}/${options.targetSampleRateHz}`
    );
  }

  const output = new Int16Array(samples.length);
  for (let offset = 0; offset < samples.length; offset += factor) {
    const end = Math.min(offset + factor, samples.length);
    let total = 0;
    for (let index = offset; index < end; index += 1) {
      total += samples[index] ?? 0;
    }
    const averaged = clampPcm16(Math.round(total / (end - offset)));
    for (let index = offset; index < end; index += 1) {
      output[index] = averaged;
    }
  }
  return output;
}

function mixSeededWhiteNoise(
  samples: Int16Array,
  options: {
    seed: number;
    snrDb: number;
  }
): Int16Array {
  const output = new Int16Array(samples.length);
  const random = createSeededRandom(options.seed);
  const speechRms = Math.max(calculateRms(samples), 1);
  const noiseRms = speechRms / 10 ** (options.snrDb / 20);
  const uniformAmplitude = noiseRms * Math.sqrt(3);

  for (let index = 0; index < samples.length; index += 1) {
    const noise = (random() * 2 - 1) * uniformAmplitude;
    output[index] = clampPcm16(Math.round((samples[index] ?? 0) + noise));
  }
  return output;
}

function calculateRms(samples: Int16Array): number {
  if (samples.length === 0) return 0;

  let total = 0;
  for (const sample of samples) {
    total += sample * sample;
  }
  return Math.sqrt(total / samples.length);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function readPcm16Samples(audio: ArrayBuffer): Int16Array {
  const sampleCount = Math.floor(audio.byteLength / 2);
  const view = new DataView(audio);
  const samples = new Int16Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true);
  }
  return samples;
}

function writePcm16Samples(samples: Int16Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(index * 2, samples[index] ?? 0, true);
  }
  return buffer;
}

function checksumArrayBuffer(audio: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(audio)).digest("hex");
}

function clampPcm16(value: number): number {
  return Math.max(INT16_MIN, Math.min(INT16_MAX, value));
}
