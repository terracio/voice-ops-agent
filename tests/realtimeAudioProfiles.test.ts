import { describe, expect, it } from "vitest";
import { RealtimeEvalCaseSchema } from "../src/evals/realtime/caseLoader";
import { applyWalkAudioProfile } from "../src/evals/realtime/walkAudioProfiles";

describe("realtime Walk audio profiles", () => {
  it("applies the phone-noise profile deterministically", () => {
    const audio = createPcm16Audio([0, 1200, -1200, 600, -600, 2400, -2400, 0]);
    const first = applyWalkAudioProfile({
      audio,
      profile: { name: "walk_phone_noise_v1", seed: 42 },
      sampleRateHz: 24_000
    });
    const second = applyWalkAudioProfile({
      audio,
      profile: { name: "walk_phone_noise_v1", seed: 42 },
      sampleRateHz: 24_000
    });

    expect(Buffer.from(first.audio)).toEqual(Buffer.from(second.audio));
    expect(first.metadata).toMatchObject({
      config: { name: "walk_phone_noise_v1", seed: 42 },
      input_sample_rate_hz: 24_000,
      output_sample_rate_hz: 24_000,
      profile_name: "walk_phone_noise_v1",
      transforms: [
        { target_sample_rate_hz: 8_000, type: "phone_bandwidth" },
        { noise: "seeded_white", snr_db: 18, type: "background_noise" }
      ]
    });
    expect(first.metadata.output_checksum_sha256).toBe(
      second.metadata.output_checksum_sha256
    );
    expect(first.metadata.output_checksum_sha256).not.toBe(
      first.metadata.input_checksum_sha256
    );
  });

  it("changes output when the seed changes and keeps PCM16 samples valid", () => {
    const audio = createPcm16Audio([
      32_700, 32_700, 32_700, -32_700, -32_700, -32_700
    ]);
    const first = applyWalkAudioProfile({
      audio,
      profile: { name: "walk_phone_noise_v1", seed: 1 },
      sampleRateHz: 24_000
    });
    const second = applyWalkAudioProfile({
      audio,
      profile: { name: "walk_phone_noise_v1", seed: 2 },
      sampleRateHz: 24_000
    });

    expect(first.metadata.output_checksum_sha256).not.toBe(
      second.metadata.output_checksum_sha256
    );
    expect(first.audio.byteLength).toBe(audio.byteLength);
    for (const sample of readPcm16Samples(first.audio)) {
      expect(sample).toBeGreaterThanOrEqual(-32_768);
      expect(sample).toBeLessThanOrEqual(32_767);
    }
  });

  it("mixes seeded noise near the declared target SNR", () => {
    const samples = Array.from({ length: 2400 }, (_, index) =>
      Math.round(Math.sin(index / 16) * 6000)
    );
    const audio = createPcm16Audio(samples);
    const profiled = applyWalkAudioProfile({
      audio,
      profile: { name: "walk_phone_noise_v1", seed: 42 },
      sampleRateHz: 24_000
    });
    const outputSamples = readPcm16Samples(profiled.audio);
    const phoneSamples = applyTestPhoneBandwidth(samples);
    const noiseSamples = outputSamples.map((sample, index) =>
      sample - (phoneSamples[index] ?? 0)
    );
    const measuredSnr = 20 * Math.log10(
      calculateRms(phoneSamples) / calculateRms(noiseSamples)
    );

    expect(measuredSnr).toBeGreaterThan(17.4);
    expect(measuredSnr).toBeLessThan(18.6);
  });

  it("parses an eval case that points at a Walk profile", () => {
    const realtimeCase = RealtimeEvalCaseSchema.parse({
      case_id: "walk_profile_contract",
      stage: "walk",
      input: {
        mode: "audio",
        text: "Can you look up customer M A Y A 0 0 1?"
      },
      audio: {
        walk_profile: { name: "walk_phone_noise_v1", seed: 171 }
      },
      expected: {
        intent: "identity_lookup",
        expected_final_state: { changed: false }
      }
    });

    expect(realtimeCase.audio.walk_profile).toEqual({
      name: "walk_phone_noise_v1",
      seed: 171
    });
    expect(realtimeCase.audio.sample_rate_hz).toBe(24_000);
    expect(realtimeCase.audio.fixture_mode).toBe("generated_on_demand");
  });
});

function createPcm16Audio(samples: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  samples.forEach((sample, index) => {
    view.setInt16(index * 2, sample, true);
  });
  return buffer;
}

function readPcm16Samples(audio: ArrayBuffer): number[] {
  const view = new DataView(audio);
  const samples: number[] = [];
  for (let offset = 0; offset < audio.byteLength; offset += 2) {
    samples.push(view.getInt16(offset, true));
  }
  return samples;
}

function applyTestPhoneBandwidth(samples: number[]): number[] {
  const factor = 3;
  const output: number[] = [];
  for (let offset = 0; offset < samples.length; offset += factor) {
    const block = samples.slice(offset, offset + factor);
    const average = Math.round(
      block.reduce((total, sample) => total + sample, 0) / block.length
    );
    output.push(...block.map(() => average));
  }
  return output;
}

function calculateRms(samples: number[]): number {
  return Math.sqrt(
    samples.reduce((total, sample) => total + sample * sample, 0) / samples.length
  );
}
