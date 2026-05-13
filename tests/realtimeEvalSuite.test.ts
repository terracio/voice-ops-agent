import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REALTIME_RUNNER_TRANSPORT, type RealtimeRunnerResult } from "../src/agent";
import { loadRealtimeEvalCase } from "../src/evals/realtime/caseLoader";
import { writeRealtimeReports } from "../src/evals/realtime/reporting";
import type { RealtimeCrawlScoring } from "../src/evals/realtime/scorerTypes";
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

  it("rejects default suites that are not defined yet", () => {
    expect(() => resolveRealtimeCaseIds({ stage: "walk" })).toThrow(
      "No default realtime walk suite is defined yet. Pass --case."
    );
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
    expect(paths.audio_artifacts?.clean_input.wav_path).toBe(cleanInput.wav_path);
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
    expect(markdown).toContain(`Checksum: ${cleanInput.checksum_sha256}`);

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
