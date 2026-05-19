import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RealtimeRunnerResult } from "../../realtime/runner/types";
import {
  buildRunArtifactManifest,
  collectGitMetadata,
  resolveInvokedCommand,
  safeArtifactSegment,
  type EvalRunGitMetadata
} from "../shared/runArtifactMetadata";
import type { RealtimeAudioArtifacts } from "./audioArtifacts";
import type { RealtimeEvalCase } from "./caseLoader";
import type { PreparedRealtimeInput } from "./input";
import {
  redactResultForReport,
  redactScoringForReport
} from "./reportRedaction";
import {
  serializeRealtimeScoring
} from "./reportGrouping";
import type { RealtimeCrawlScoring } from "./scorerTypes";

export type RealtimeAttemptArtifactPaths = {
  attempt_id: string;
  realtime_run_id: string;
  run_artifact_dir: string;
  run_artifact_files: {
    audio_manifest_path: string;
    audit_path: string;
    final_state_path: string;
    report_json_path: string;
    report_markdown_path: string;
    scoring_path: string;
    sim_status_path: string;
    simulation_path: string;
    tool_calls_path: string;
    trace_path: string;
    transcript_path: string;
  };
};

export type RealtimeRunResultsPaths = {
  artifactsDir: string;
  resultsJsonPath: string;
  resultsMarkdownPath: string;
  runDir: string;
  simulationsDir: string;
};

export type RealtimeRunCaseArtifactSummary = {
  case_id: string;
  input_mode: string;
  json_path: string;
  markdown_path: string;
  model: string;
  reward_basis: string[];
  diagnostic_failures: number;
  reward_failures: number;
  score_failures: number;
  scoring_status: string;
  stage: string;
  status: string;
  trace_path: string;
  run_artifact_dir?: string;
  [key: string]: unknown;
};

export function realtimeRunDir(reportRoot: string, runId: string): string {
  return join(
    reportRoot,
    "evals",
    "realtime",
    safeArtifactSegment(runId)
  );
}

export function realtimeAttemptDir(options: {
  attemptId: string;
  caseId: string;
  reportRoot?: string;
  runId: string;
}): string {
  return join(
    realtimeRunDir(options.reportRoot ?? "reports", options.runId),
    "artifacts",
    safeArtifactSegment(options.caseId),
    safeArtifactSegment(options.attemptId)
  );
}

export function writeRealtimeAttemptArtifacts(options: {
  audioArtifacts?: RealtimeAudioArtifacts;
  attemptId?: string;
  caseId: string;
  env_file_status: string;
  preparedInput: PreparedRealtimeInput;
  realtimeCase: RealtimeEvalCase;
  reportRoot?: string;
  result: RealtimeRunnerResult;
  runId: string;
  scoring: RealtimeCrawlScoring;
  stage: string;
}): RealtimeAttemptArtifactPaths {
  const reportRoot = options.reportRoot ?? "reports";
  const runDir = realtimeRunDir(reportRoot, options.runId);
  const simulationsDir = join(runDir, "simulations");
  const attemptId = options.attemptId ?? options.result.run_id;
  const attemptDir = realtimeAttemptDir({
    attemptId,
    caseId: options.caseId,
    reportRoot,
    runId: options.runId
  });
  const audioDir = join(attemptDir, "audio");

  mkdirSync(simulationsDir, { recursive: true });
  mkdirSync(audioDir, { recursive: true });

  const files = {
    audio_manifest_path: join(audioDir, "manifest.json"),
    audit_path: join(attemptDir, "audit.json"),
    final_state_path: join(attemptDir, "final_state.json"),
    report_json_path: join(attemptDir, "report.json"),
    report_markdown_path: join(attemptDir, "report.md"),
    scoring_path: join(attemptDir, "scoring.json"),
    sim_status_path: join(attemptDir, "sim_status.json"),
    simulation_path: join(
      simulationsDir,
      `${safeArtifactSegment(options.caseId)}_${safeArtifactSegment(attemptId)}.json`
    ),
    tool_calls_path: join(attemptDir, "tool_calls.json"),
    trace_path: join(attemptDir, "trace.json"),
    transcript_path: join(attemptDir, "transcript.json")
  };
  const redactedResult = redactResultForReport(options.result);
  const redactedScoring = redactScoringForReport(options.scoring);
  const serializedScoring = serializeRealtimeScoring({
    realtimeCase: options.realtimeCase,
    scoring: redactedScoring
  });
  const status = {
    run_id: options.runId,
    attempt_id: attemptId,
    realtime_run_id: options.result.run_id,
    case_id: options.caseId,
    stage: options.stage,
    seed_id: options.realtimeCase.seed_id,
    reward_basis: options.realtimeCase.reward_basis,
    input_mode: options.preparedInput.input_mode,
    status: options.result.status,
    reason: options.result.reason,
    scoring_status: options.scoring.status,
    score_failures: options.scoring.score_failures,
    reward_failures: serializedScoring.reward_failures.length,
    diagnostic_failures: serializedScoring.diagnostic_failures.length,
    model: options.result.model,
    transport: options.result.transport,
    env_file_status: options.env_file_status,
    artifact_paths: files
  };

  writeJson(files.sim_status_path, status);
  writeJson(files.trace_path, options.result.trace);
  writeJson(files.transcript_path, redactedResult.transcript_fragments);
  writeJson(files.tool_calls_path, redactedResult.tool_calls);
  writeJson(files.audit_path, {
    audit_ids: redactedResult.audit_ids,
    audit_events: redactedResult.audit_events
  });
  writeJson(files.final_state_path, redactedResult.final_state);
  writeJson(files.scoring_path, serializedScoring);
  writeJson(files.audio_manifest_path, {
    audio_artifacts: options.audioArtifacts,
    note: "Input audio files are stored in this attempt artifact directory."
  });
  writeJson(files.simulation_path, {
    ...status,
    artifact_dir: attemptDir
  });

  return {
    attempt_id: attemptId,
    realtime_run_id: options.result.run_id,
    run_artifact_dir: attemptDir,
    run_artifact_files: files
  };
}

export function writeRealtimeRunResults(options: {
  git?: EvalRunGitMetadata;
  invokedCommand?: string;
  model?: string;
  reportRoot?: string;
  results: RealtimeRunCaseArtifactSummary[];
  runId: string;
  stage: string;
  summary: Record<string, unknown>;
}): RealtimeRunResultsPaths {
  const reportRoot = options.reportRoot ?? "reports";
  const runDir = realtimeRunDir(reportRoot, options.runId);
  const simulationsDir = join(runDir, "simulations");
  const artifactsDir = join(runDir, "artifacts");
  const resultsJsonPath = join(runDir, "results.json");
  const resultsMarkdownPath = join(runDir, "results.md");

  mkdirSync(simulationsDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });

  const manifest = buildRunArtifactManifest({
    artifacts: {
      run_dir: runDir,
      simulations_dir: simulationsDir,
      artifacts_dir: artifactsDir
    },
    git: options.git ?? collectGitMetadata(),
    invokedCommand: options.invokedCommand ?? resolveInvokedCommand(),
    model: options.model ?? options.results[0]?.model,
    runId: options.runId,
    stage: options.stage,
    suite: "realtime"
  });
  const results = {
    ...manifest,
    summary: options.summary,
    results: options.results
  };

  writeJson(resultsJsonPath, results);
  writeFileSync(resultsMarkdownPath, renderRealtimeRunMarkdown({
    manifest,
    results: options.results,
    summary: options.summary
  }));

  return { runDir, resultsJsonPath, resultsMarkdownPath, simulationsDir, artifactsDir };
}

function renderRealtimeRunMarkdown(options: {
  manifest: ReturnType<typeof buildRunArtifactManifest>;
  results: RealtimeRunCaseArtifactSummary[];
  summary: Record<string, unknown>;
}): string {
  const lines = [
    "# MealPlan VoiceOps Realtime Eval Run",
    "",
    `- Run: \`${options.manifest.run_id}\``,
    `- Suite: \`${options.manifest.suite}\``,
    `- Stage: \`${options.manifest.stage ?? ""}\``,
    options.manifest.model ? `- Model: \`${options.manifest.model}\`` : undefined,
    `- Cases: ${options.summary.case_count ?? options.results.length}`,
    `- Completed: ${options.summary.completed ?? 0}`,
    `- Failed: ${options.summary.failed ?? 0}`,
    `- Timed out: ${options.summary.timed_out ?? 0}`,
    `- Score failures: ${options.summary.score_failures ?? 0}`,
    `- Reward failures: ${options.summary.reward_failures ?? 0}`,
    "",
    "## Artifacts",
    "",
    `- Run directory: \`${options.manifest.artifacts.run_dir}\``,
    `- Simulations directory: \`${options.manifest.artifacts.simulations_dir}\``,
    `- Artifacts directory: \`${options.manifest.artifacts.artifacts_dir}\``,
    "",
    "## Case Attempts",
    "",
    "| Case | Reward basis | Status | Scoring | Reward failures | Diagnostic failures | Raw score failures | Report | Artifact directory |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ].filter((line): line is string => line !== undefined);

  for (const result of options.results) {
    lines.push(
      `| \`${result.case_id}\` | ${result.reward_basis.join(", ")} | ` +
        `${result.status} | ${result.scoring_status} | ` +
        `${result.reward_failures} | ${result.diagnostic_failures} | ` +
        `${result.score_failures} | \`${result.markdown_path}\` | ` +
        `\`${result.run_artifact_dir ?? ""}\` |`
    );
  }

  return `${lines.join("\n")}\n`;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
