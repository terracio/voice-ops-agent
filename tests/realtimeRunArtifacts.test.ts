import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REALTIME_RUNNER_TRANSPORT,
  type RealtimeRunnerResult
} from "../src/realtime/runner/types";
import { loadRealtimeEvalCase } from "../src/evals/realtime/caseLoader";
import { writeRealtimeReports } from "../src/evals/realtime/reporting";
import {
  writeRealtimeRunResults,
  type RealtimeRunCaseArtifactSummary
} from "../src/evals/realtime/runArtifacts";
import type { RealtimeCrawlScoring } from "../src/evals/realtime/scorerTypes";
import { REALTIME_CRAWL_DEFAULT_REWARD_BASIS } from "../src/evals/rewardBasis";

const LEGACY_DIR = join(
  "reports",
  "realtime",
  "crawl",
  "maya_smoke",
  "unit_run_artifacts_attempt"
);
const RUN_DIR = join(
  "reports",
  "evals",
  "realtime",
  "unit_realtime_run_artifacts"
);

afterEach(() => {
  rmSync(LEGACY_DIR, { force: true, recursive: true });
  rmSync(RUN_DIR, { force: true, recursive: true });
});

describe("realtime eval run artifacts", () => {
  it("keeps per-case reports and writes run-level attempt artifacts", () => {
    rmSync(LEGACY_DIR, { force: true, recursive: true });
    rmSync(RUN_DIR, { force: true, recursive: true });

    const paths = writeRealtimeReports({
      caseId: "maya_smoke",
      env_file_status: "skipped",
      preparedInput: {
        audio_metadata: { source: "test" },
        input_mode: "audio",
        input_text: "Please look up Maya."
      },
      realtimeCase: loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" }),
      result: createResult(),
      runArtifacts: {
        runId: "unit_realtime_run_artifacts"
      },
      scoring: createScoring(),
      stage: "crawl"
    });
    const runPaths = writeRealtimeRunResults({
      results: [caseSummary(paths)],
      runId: "unit_realtime_run_artifacts",
      stage: "crawl",
      summary: {
        case_count: 1,
        completed: 1,
        failed: 0,
        score_failures: 0,
        timed_out: 0
      }
    });
    const runJson = JSON.parse(readFileSync(runPaths.resultsJsonPath, "utf8")) as {
      schema_version: string;
      run_id: string;
      suite: string;
      artifacts: Record<string, string>;
      results: RealtimeRunCaseArtifactSummary[];
    };
    const reportJson = JSON.parse(readFileSync(paths.json_path, "utf8")) as {
      reward_basis: string[];
    };
    const simStatusJson = JSON.parse(
      readFileSync(paths.run_artifact_files?.sim_status_path ?? "", "utf8")
    ) as { reward_basis: string[] };

    expect(existsSync(join(LEGACY_DIR, "report.json"))).toBe(true);
    expect(existsSync(join(LEGACY_DIR, "report.md"))).toBe(true);
    expect(existsSync(join(LEGACY_DIR, "trace.json"))).toBe(true);
    expect(paths.run_artifact_dir).toBe(
      join(RUN_DIR, "artifacts", "maya_smoke", "unit_run_artifacts_attempt")
    );
    expect(existsSync(paths.run_artifact_files?.sim_status_path ?? "")).toBe(true);
    expect(existsSync(paths.run_artifact_files?.trace_path ?? "")).toBe(true);
    expect(existsSync(paths.run_artifact_files?.transcript_path ?? "")).toBe(true);
    expect(existsSync(paths.run_artifact_files?.tool_calls_path ?? "")).toBe(true);
    expect(existsSync(paths.run_artifact_files?.audit_path ?? "")).toBe(true);
    expect(existsSync(paths.run_artifact_files?.final_state_path ?? "")).toBe(true);
    expect(existsSync(paths.run_artifact_files?.scoring_path ?? "")).toBe(true);
    expect(existsSync(join(paths.run_artifact_dir ?? "", "audio"))).toBe(true);
    expect(runJson).toMatchObject({
      schema_version: "eval_run_artifacts.v1",
      run_id: "unit_realtime_run_artifacts",
      suite: "realtime"
    });
    expect(runJson.artifacts.artifacts_dir).toBe(join(RUN_DIR, "artifacts"));
    expect(reportJson.reward_basis).toEqual(REALTIME_CRAWL_DEFAULT_REWARD_BASIS);
    expect(simStatusJson.reward_basis).toEqual(
      REALTIME_CRAWL_DEFAULT_REWARD_BASIS
    );
    expect(runJson.results[0]?.reward_basis).toEqual(
      REALTIME_CRAWL_DEFAULT_REWARD_BASIS
    );
    expect(runJson.results[0]?.run_artifact_dir).toBe(paths.run_artifact_dir);
    expect(readFileSync(runPaths.resultsMarkdownPath, "utf8")).toContain(
      "MealPlan VoiceOps Realtime Eval Run"
    );
  });
});

function caseSummary(
  paths: ReturnType<typeof writeRealtimeReports>
): RealtimeRunCaseArtifactSummary {
  return {
    case_id: "maya_smoke",
    diagnostic_failures: 0,
    input_mode: "audio",
    json_path: paths.json_path,
    markdown_path: paths.markdown_path,
    model: "gpt-realtime-2",
    reward_basis: REALTIME_CRAWL_DEFAULT_REWARD_BASIS,
    reward_failures: 0,
    score_failures: 0,
    scoring_status: "passed",
    stage: "crawl",
    status: "completed",
    trace_path: paths.trace_path,
    audio_artifacts: paths.audio_artifacts,
    run_artifact_dir: paths.run_artifact_dir,
    run_artifact_files: paths.run_artifact_files
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
    run_id: "unit_run_artifacts_attempt",
    session_id: "unit_run_artifacts_attempt_session",
    status: "completed",
    tool_calls: [],
    trace: [{
      at: "2026-05-12T10:00:00.000Z",
      source: "runner",
      type: "start"
    }],
    transcript_fragments: [{
      at: "2026-05-12T10:00:01.000Z",
      role: "user",
      source_event_type: "conversation.item.input_audio_transcription.completed",
      text: "Please look up Maya."
    }],
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
