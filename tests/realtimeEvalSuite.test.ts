import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REALTIME_RUNNER_TRANSPORT,
  type RealtimeRunnerResult
} from "../src/realtime/runner/types";
import { loadRealtimeEvalCase } from "../src/evals/realtime/caseLoader";
import { writeRealtimeReports } from "../src/evals/realtime/reporting";
import type { RealtimeCrawlScoring } from "../src/evals/realtime/scorerTypes";
import { applyWalkAudioProfile } from "../src/evals/realtime/walkAudioProfiles";
import {
  resolveRealtimeCaseIds,
  shouldFailRealtimeEval,
  type RealtimeCaseRunSummary
} from "../src/evals/realtime/suite";

describe("realtime eval suite", () => {
  it("resolves the first Crawl suite when no case is provided", () => {
    expect(resolveRealtimeCaseIds({ stage: "crawl" })).toEqual([
      "maya_smoke",
      "missing_identity_asks_clarification",
      "ambiguous_date_asks_clarification",
      "allergy_change_escalates",
      "payment_settlement_forbidden"
    ]);
  });

  it("keeps explicit case runs individual", () => {
    expect(
      resolveRealtimeCaseIds({ caseId: "maya_smoke", stage: "crawl" })
    ).toEqual(["maya_smoke"]);
  });

  it("resolves the first Walk robustness suite from Crawl case ids", () => {
    expect(resolveRealtimeCaseIds({ stage: "walk" })).toEqual([
      "maya_smoke",
      "missing_identity_asks_clarification",
      "ambiguous_date_asks_clarification",
      "allergy_change_escalates",
      "payment_settlement_forbidden"
    ]);
  });

  it("marks completed scoring failures as eval failures", () => {
    expect(shouldFailRealtimeEval([
      createSummary({ scoring_status: "failed", status: "completed" })
    ])).toBe(true);
    expect(shouldFailRealtimeEval([
      createSummary({ scoring_status: "passed", status: "completed" })
    ])).toBe(false);
  });

  it("writes a separate raw trace file and report pointer", () => {
    const reportDir = join(
      "reports",
      "realtime",
      "crawl",
      "maya_smoke",
      "unit_report_trace"
    );
    rmSync(reportDir, { force: true, recursive: true });

    const paths = writeRealtimeReports({
      caseId: "maya_smoke",
      env_file_status: "skipped",
      preparedInput: {
        input_mode: "audio",
        input_text: "Please look up Maya.",
        audio_metadata: { source: "test" }
      },
      realtimeCase: loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" }),
      result: createResult(),
      scoring: createScoring(),
      stage: "crawl"
    });

    expect(paths.trace_path).toBe(join(reportDir, "trace.json"));
    expect(existsSync(paths.trace_path)).toBe(true);
    expect(JSON.parse(readFileSync(paths.trace_path, "utf8"))).toEqual([
      {
        at: "2026-05-12T10:00:00.000Z",
        source: "runner",
        type: "start"
      }
    ]);
    expect(
      JSON.parse(readFileSync(paths.json_path, "utf8")).trace_path
    ).toBe(paths.trace_path);
    expect(
      JSON.parse(readFileSync(paths.json_path, "utf8")).audio_artifacts
    ).toBeUndefined();
    expect(readFileSync(paths.markdown_path, "utf8")).toContain(
      "## Out-of-Band Realtime Transcript\n\nNot requested."
    );

    rmSync(reportDir, { force: true, recursive: true });
  });

  it("writes clean input PCM and playable WAV audio artifacts", () => {
    const reportDir = join(
      "reports",
      "realtime",
      "crawl",
      "maya_smoke",
      "unit_report_trace"
    );
    rmSync(reportDir, { force: true, recursive: true });

    const paths = writeRealtimeReports({
      caseId: "maya_smoke",
      env_file_status: "loaded",
      preparedInput: {
        audio: new Uint8Array([0, 0, 255, 127, 0, 128, 1, 0]).buffer,
        input_mode: "audio",
        input_text: "Please look up Maya.",
        audio_metadata: { source: "test", sample_rate_hz: 24_000 }
      },
      realtimeCase: loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" }),
      result: createResult(),
      scoring: createScoring(),
      stage: "crawl"
    });

    const report = JSON.parse(readFileSync(paths.json_path, "utf8"));
    const cleanInput = report.audio_artifacts.clean_input;
    expect(cleanInput).toMatchObject({
      byte_length: 8,
      channels: 1,
      duration_ms: 0,
      encoding: "pcm16le",
      label: "clean_input",
      sample_rate_hz: 24_000
    });
    expect(cleanInput.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(cleanInput.pcm_path).toBe(join(reportDir, "audio", "clean_input.pcm"));
    expect(cleanInput.wav_path).toBe(join(reportDir, "audio", "clean_input.wav"));
    expect(paths.audio_artifacts?.clean_input?.wav_path).toBe(cleanInput.wav_path);
    expect(readFileSync(cleanInput.pcm_path)).toEqual(
      Buffer.from([0, 0, 255, 127, 0, 128, 1, 0])
    );

    const wav = readFileSync(cleanInput.wav_path);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(8);

    const markdown = readFileSync(paths.markdown_path, "utf8");
    expect(markdown).toContain(`Clean WAV: ${cleanInput.wav_path}`);
    expect(markdown).toContain(`Clean checksum: ${cleanInput.checksum_sha256}`);

    rmSync(reportDir, { force: true, recursive: true });
  });

  it("writes transformed Walk profile audio artifacts without replacing clean input", () => {
    const reportDir = join(
      "reports",
      "realtime",
      "walk",
      "maya_smoke",
      "unit_report_trace"
    );
    rmSync(reportDir, { force: true, recursive: true });

    const cleanAudio = new Uint8Array([
      0, 0, 255, 31, 1, 224, 0, 0, 255, 63, 1, 192
    ]).buffer;
    const profile = applyWalkAudioProfile({
      audio: cleanAudio,
      profile: { name: "walk_phone_noise_v1", seed: 1701 },
      sampleRateHz: 24_000
    });
    const paths = writeRealtimeReports({
      caseId: "maya_smoke",
      env_file_status: "loaded",
      preparedInput: {
        audio: profile.audio,
        clean_audio: cleanAudio,
        input_mode: "audio",
        input_text: "Please look up Maya.",
        walk_profile: profile.metadata,
        audio_metadata: {
          source: "test",
          sample_rate_hz: 24_000,
          walk_profile: profile.metadata
        }
      },
      realtimeCase: loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" }),
      result: createResult(),
      scoring: createScoring(),
      stage: "walk"
    });

    const report = JSON.parse(readFileSync(paths.json_path, "utf8"));
    expect(report.audio_profile).toMatchObject({
      profile_name: "walk_phone_noise_v1",
      config: { seed: 1701 }
    });
    expect(report.audio_artifacts.clean_input.checksum_sha256).toBe(
      profile.metadata.input_checksum_sha256
    );
    expect(report.audio_artifacts.profile_input.checksum_sha256).toBe(
      profile.metadata.output_checksum_sha256
    );
    expect(report.audio_artifacts.profile_input.wav_path).toBe(
      join(reportDir, "audio", "profile_input.wav")
    );
    expect(readFileSync(report.audio_artifacts.clean_input.pcm_path)).toEqual(
      Buffer.from(cleanAudio)
    );
    expect(readFileSync(report.audio_artifacts.profile_input.pcm_path)).toEqual(
      Buffer.from(profile.audio)
    );

    const markdown = readFileSync(paths.markdown_path, "utf8");
    expect(markdown).toContain(`Profile WAV: ${report.audio_artifacts.profile_input.wav_path}`);
    expect(markdown).toContain("Profile metadata:");

    rmSync(reportDir, { force: true, recursive: true });
  });

  it("does not label profiled audio as clean evidence when source audio is missing", () => {
    const reportDir = join(
      "reports",
      "realtime",
      "walk",
      "maya_smoke",
      "unit_report_trace"
    );
    rmSync(reportDir, { force: true, recursive: true });

    const cleanAudio = new Uint8Array([
      0, 0, 255, 31, 1, 224, 0, 0, 255, 63, 1, 192
    ]).buffer;
    const profile = applyWalkAudioProfile({
      audio: cleanAudio,
      profile: { name: "walk_phone_noise_v1", seed: 1701 },
      sampleRateHz: 24_000
    });
    const paths = writeRealtimeReports({
      caseId: "maya_smoke",
      env_file_status: "loaded",
      preparedInput: {
        audio: profile.audio,
        input_mode: "audio",
        input_text: "Please look up Maya.",
        walk_profile: profile.metadata,
        audio_metadata: {
          source: "test",
          sample_rate_hz: 24_000,
          walk_profile: profile.metadata
        }
      },
      realtimeCase: loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" }),
      result: createResult(),
      scoring: createScoring(),
      stage: "walk"
    });

    const report = JSON.parse(readFileSync(paths.json_path, "utf8"));
    expect(report.audio_artifacts.clean_input).toBeUndefined();
    expect(report.audio_artifacts.profile_input.checksum_sha256).toBe(
      profile.metadata.output_checksum_sha256
    );
    expect(readFileSync(report.audio_artifacts.profile_input.pcm_path)).toEqual(
      Buffer.from(profile.audio)
    );
    expect(readFileSync(paths.markdown_path, "utf8")).toContain(
      `Profile WAV: ${report.audio_artifacts.profile_input.wav_path}`
    );

    rmSync(reportDir, { force: true, recursive: true });
  });

  it("redacts sensitive report artifacts across json and markdown", () => {
    const reportDir = join(
      "reports",
      "realtime",
      "crawl",
      "maya_smoke",
      "unit_report_trace"
    );
    rmSync(reportDir, { force: true, recursive: true });

    const sensitive = "SECRET_CUSTOMER_TOKEN_123";
    const paths = writeRealtimeReports({
      caseId: "maya_smoke",
      env_file_status: "loaded",
      preparedInput: {
        input_mode: "text",
        input_text: "Caller requested account help.",
        audio_metadata: { source: "test" }
      },
      realtimeCase: loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" }),
      result: {
        ...createResult(),
        audit_events: [{
          at: "2026-05-12T10:00:00.000Z",
          event_id: "aud_1",
          actor: "agent",
          type: "tool_executed",
          customer_id: "cus_001",
          details: {
            transcript_excerpt: sensitive,
            resource_id: "resource_sensitive",
            nested: { customer_id: "cus_001", text: sensitive }
          }
        }],
        final_state: {
          customer_states: [{
            customer: {
              customer_id: "cus_001",
              name: "Maya Secret",
              phone: "+1-555-555-1234",
              allergies: ["peanut"],
              customizations: { dislikes: ["onion"], protein_preferences: ["fish"] },
              payment_last_checked_at: "2026-05-12T10:00:00.000Z",
              payment_status: "past_due"
            },
            service_dates: ["2026-05-20"]
          }],
          kitchen_deltas: [{
            created_at: "2026-05-12T10:00:00.000Z",
            customer_id: "cus_001",
            delta_id: "kdelta_1",
            line_items: [sensitive]
          }],
          payment_followups: [{
            created_at: "2026-05-12T10:00:00.000Z",
            customer_id: "cus_001",
            followup_id: "pf_1",
            reason: sensitive
          }]
        },
        out_of_band_transcription: { status: "completed", transcript: sensitive },
        tool_calls: [{
          audit_event_ids: ["aud_1"],
          input: { customer_id: "cus_001", note: sensitive },
          started_at: "2026-05-12T10:00:00.000Z",
          status: "completed",
          tool_call_id: "tc_1",
          tool_name: "lookup_customer",
          output: { note: sensitive }
        }],
        trace: [{ at: "2026-05-12T10:00:00.000Z", source: "runner", type: sensitive }],
        transcript_fragments: [{
          at: "2026-05-12T10:00:00.000Z",
          role: "user",
          source_event_type: "response.done",
          text: sensitive
        }]
      },
      scoring: createScoring(),
      stage: "crawl"
    });

    const reportJson = readFileSync(paths.json_path, "utf8");
    const reportMd = readFileSync(paths.markdown_path, "utf8");

    expect(reportJson).not.toContain(sensitive);
    expect(reportMd).not.toContain(sensitive);
    expect(reportJson).toContain('"trace": []');
    expect(reportJson).toContain('"trace_path"');
    expect(reportMd).toContain("[redacted]");

    rmSync(reportDir, { force: true, recursive: true });
  });
});

function createSummary(
  overrides: Partial<RealtimeCaseRunSummary> = {}
): RealtimeCaseRunSummary {
  return {
    audit_event_count: 0,
    case_id: "maya_smoke",
    env_file_status: "skipped",
    input_mode: "audio",
    json_path: "report.json",
    markdown_path: "report.md",
    model: "gpt-realtime-2",
    platform_tracing_enabled: true,
    score_failures: 0,
    scoring_status: "passed",
    stage: "crawl",
    status: "completed",
    tool_call_count: 0,
    trace_event_count: 0,
    trace_path: "trace.json",
    transcript_fragment_count: 0,
    transport: REALTIME_RUNNER_TRANSPORT,
    ...overrides
  };
}

function createResult(): RealtimeRunnerResult {
  return {
    audit_events: [],
    audit_ids: [],
    event_counts: {},
    final_state: {
      customer_states: [],
      kitchen_deltas: [],
      payment_followups: []
    },
    model: "gpt-realtime-2",
    platform_tracing: {
      enabled: true,
      group_id: "unit_group",
      workflow_name: "Unit Realtime Eval"
    },
    run_id: "unit_report_trace",
    session_id: "unit_report_trace_session",
    status: "completed",
    tool_calls: [],
    trace: [{
      at: "2026-05-12T10:00:00.000Z",
      source: "runner",
      type: "start"
    }],
    transcript_fragments: [],
    transport: REALTIME_RUNNER_TRANSPORT
  };
}

function createScoring(): RealtimeCrawlScoring {
  return {
    diagnostics: [],
    score_failures: 0,
    scores: [],
    status: "passed"
  };
}
