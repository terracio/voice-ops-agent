import { runRealtimeAgentSmoke } from "../realtime/runner/runner";
import {
  loadOpenAIServerEnv,
  resolveOpenAIRealtimeCredentials
} from "../realtime/runner/support";
import { REALTIME_RUNTIME_CONFIG } from "../realtime/config/runtimeConfig";
import { resetDb } from "../domain/db";
import {
  applyWalkProfileContract,
  createTextRealtimeEvalCase,
  loadRealtimeEvalCase,
  type RealtimeEvalCase
} from "./realtime/caseLoader";
import { prepareRealtimeInput } from "./realtime/input";
import {
  createRunStamp,
  safePathSegment,
  writeRealtimeReports
} from "./realtime/reporting";
import { buildRealtimeScoringAggregation } from "./realtime/reportGrouping";
import { writeRealtimeRunResults } from "./realtime/runArtifacts";
import { scoreRealtimeCrawlCase } from "./realtime/scorer";
import {
  resolveRealtimeCaseIds,
  shouldFailRealtimeEval,
  summarizeRealtimeSuite,
  type RealtimeCaseRunSummary
} from "./realtime/suite";
import {
  WALK_AUDIO_PROFILE_NAMES,
  type WalkAudioProfileName
} from "./realtime/walkAudioProfiles";

type RealtimeEvalArgs = {
  caseId?: string;
  inputText?: string;
  noEnv: boolean;
  oobTranscription: boolean;
  stage: string;
  walkProfile?: WalkAudioProfileName;
};

function readArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function parseArgs(args: string[]): RealtimeEvalArgs {
  const walkProfile = parseWalkProfile(readArgValue(args, "--walk-profile"));
  return {
    caseId: readArgValue(args, "--case"),
    inputText: readArgValue(args, "--input-text"),
    noEnv: args.includes("--no-env"),
    oobTranscription: args.includes("--oob-transcription"),
    stage: readArgValue(args, "--stage") ?? "crawl",
    walkProfile
  };
}

function parseWalkProfile(value?: string): WalkAudioProfileName | undefined {
  if (!value) return undefined;
  const parsed = WALK_AUDIO_PROFILE_NAMES.find((profile) => profile === value);
  if (!parsed) {
    throw new Error(
      `Unsupported --walk-profile ${value}. Expected one of: ${WALK_AUDIO_PROFILE_NAMES.join(", ")}.`
    );
  }
  return parsed;
}

function loadCase(options: {
  caseId: string;
  inputText?: string;
  stage: string;
  walkProfile?: WalkAudioProfileName;
}): RealtimeEvalCase {
  const realtimeCase = options.inputText
    ? createTextRealtimeEvalCase({
      caseId: options.caseId,
      stage: options.stage,
      text: options.inputText
    })
    : loadRealtimeEvalCase({
      caseId: options.caseId,
      stage: options.stage
    });

  if (!options.walkProfile || realtimeCase.input.mode !== "audio") return realtimeCase;
  return applyWalkProfileContract({
    realtimeCase,
    walkProfile: options.walkProfile
  });
}

async function runRealtimeEvalCase(options: {
  apiKey?: string;
  attemptArtifactId: string;
  caseId: string;
  env_file_status: string;
  inputText?: string;
  oobTranscription?: boolean;
  runLevelRunId: string;
  runStamp: string;
  stage: string;
  walkProfile?: WalkAudioProfileName;
}): Promise<RealtimeCaseRunSummary> {
  const realtimeCase = loadCase(options);
  resetDb(realtimeCase.seed_id);

  const preparedInput = await prepareRealtimeInput({
    apiKey: options.apiKey,
    realtimeCase
  });
  const runId = [
    "realtime",
    safePathSegment(options.stage),
    safePathSegment(options.caseId),
    options.runStamp
  ].join("_");
  const result = await runRealtimeAgentSmoke({
    runId,
    sessionId: `${runId}_session`,
    serverContext: realtimeCase.setup?.server_context,
    initialSessionState: realtimeCase.setup?.initial_session_state,
    lastUserMessage: realtimeCase.input.text,
    audio: preparedInput.audio,
    audioChunkDurationMs: realtimeCase.audio.chunk_duration_ms,
    inputText: preparedInput.inputText,
    outOfBandTranscription: options.oobTranscription,
    quietMs: REALTIME_RUNTIME_CONFIG.evalReplay.quietMs,
    timeoutMs: REALTIME_RUNTIME_CONFIG.evalReplay.timeoutMs,
    traceGroupId: `realtime_${safePathSegment(options.stage)}_${options.runStamp}`,
    traceMetadata: {
      case_id: options.caseId,
      input_mode: preparedInput.input_mode,
      oob_transcription: options.oobTranscription,
      seed_id: realtimeCase.seed_id,
      stage: options.stage,
      walk_profile: options.walkProfile
    },
    workflowName: `MealPlan VoiceOps Realtime ${options.stage} Eval`
  });
  const scoring = scoreRealtimeCrawlCase(realtimeCase, result);
  const rewardEvaluation = buildRealtimeScoringAggregation({
    realtimeCase,
    scoring
  });
  const reportPaths = writeRealtimeReports({
    caseId: options.caseId,
    env_file_status: options.env_file_status,
    preparedInput,
    realtimeCase,
    result,
    runArtifacts: {
      attemptId: options.attemptArtifactId,
      runId: options.runLevelRunId
    },
    scoring,
    stage: options.stage
  });

  return {
    case_id: options.caseId,
    stage: options.stage,
    status: result.status,
    scoring_status: scoring.status,
    score_failures: scoring.score_failures,
    reward_failures: rewardEvaluation.reward_failures.length,
    diagnostic_failures: rewardEvaluation.diagnostic_failures.length,
    reason: result.reason,
    model: result.model,
    reward_basis: realtimeCase.reward_basis,
    transport: result.transport,
    input_mode: preparedInput.input_mode,
    env_file_status: options.env_file_status,
    platform_tracing_enabled: result.platform_tracing.enabled,
    platform_trace_group_id: result.platform_tracing.group_id,
    trace_event_count: result.trace.length,
    transcript_fragment_count: result.transcript_fragments.length,
    tool_call_count: result.tool_calls.length,
    audit_event_count: result.audit_events.length,
    ...reportPaths
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const caseIds = resolveRealtimeCaseIds(args);
  const env_file_status = args.noEnv ? "skipped" : loadOpenAIServerEnv();
  const credentials = resolveOpenAIRealtimeCredentials({
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL
    }
  });
  const runStamp = createRunStamp();
  const runLevelRunId = createRealtimeRunLevelId(args.stage, runStamp);
  const attemptCounts = new Map<string, number>();
  const results: RealtimeCaseRunSummary[] = [];

  for (const caseId of caseIds) {
    const attemptArtifactId = nextAttemptArtifactId({
      attemptCounts,
      caseId
    });
    results.push(
      await runRealtimeEvalCase({
        apiKey: credentials.ok ? credentials.apiKey : undefined,
        attemptArtifactId,
        caseId,
        env_file_status,
        inputText: args.inputText,
        oobTranscription: args.oobTranscription,
        runLevelRunId,
        runStamp,
        stage: args.stage,
        walkProfile: args.walkProfile
      })
    );
  }

  const summary = summarizeRealtimeSuite({
    caseIds,
    inputText: args.inputText,
    results,
    stage: args.stage
  });
  writeRealtimeRunResults({
    results,
    runId: runLevelRunId,
    stage: args.stage,
    summary: summaryWithoutCaseResults(summary)
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (shouldFailRealtimeEval(results)) {
    process.exitCode = 1;
  }
}

void main();

function createRealtimeRunLevelId(stage: string, runStamp: string): string {
  return `realtime_${safePathSegment(stage)}_${runStamp}`;
}

function nextAttemptArtifactId(options: {
  attemptCounts: Map<string, number>;
  caseId: string;
}): string {
  const nextCount = (options.attemptCounts.get(options.caseId) ?? 0) + 1;
  options.attemptCounts.set(options.caseId, nextCount);
  return `attempt_${nextCount.toString().padStart(3, "0")}`;
}

function summaryWithoutCaseResults(
  summary: Record<string, unknown>
): Record<string, unknown> {
  const { results: _results, ...rest } = summary;
  return rest;
}
