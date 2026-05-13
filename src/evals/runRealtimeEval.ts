import { runRealtimeAgentSmoke } from "../agent/realtimeRunner";
import {
  loadOpenAIServerEnv,
  resolveOpenAIRealtimeCredentials
} from "../agent/realtimeRunnerSupport";
import { resetDb } from "../domain/db";
import {
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
import { scoreRealtimeCrawlCase } from "./realtime/scorer";
import {
  resolveRealtimeCaseIds,
  shouldFailRealtimeEval,
  summarizeRealtimeSuite,
  type RealtimeCaseRunSummary
} from "./realtime/suite";

type RealtimeEvalArgs = {
  caseId?: string;
  inputText?: string;
  noEnv: boolean;
  stage: string;
};

function readArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function parseArgs(args: string[]): RealtimeEvalArgs {
  return {
    caseId: readArgValue(args, "--case"),
    inputText: readArgValue(args, "--input-text"),
    noEnv: args.includes("--no-env"),
    stage: readArgValue(args, "--stage") ?? "crawl"
  };
}

function loadCase(options: {
  caseId: string;
  inputText?: string;
  stage: string;
}): RealtimeEvalCase {
  if (options.inputText) {
    return createTextRealtimeEvalCase({
      caseId: options.caseId,
      stage: options.stage,
      text: options.inputText
    });
  }

  return loadRealtimeEvalCase({
    caseId: options.caseId,
    stage: options.stage
  });
}

async function runRealtimeEvalCase(options: {
  apiKey?: string;
  caseId: string;
  env_file_status: string;
  inputText?: string;
  runStamp: string;
  stage: string;
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
    lastUserMessage: realtimeCase.input.text,
    audio: preparedInput.audio,
    audioChunkDurationMs: realtimeCase.audio.chunk_duration_ms,
    inputText: preparedInput.inputText,
    quietMs: 1_000,
    timeoutMs: 20_000
  });
  const scoring = scoreRealtimeCrawlCase(realtimeCase, result);
  const reportPaths = writeRealtimeReports({
    caseId: options.caseId,
    env_file_status: options.env_file_status,
    preparedInput,
    realtimeCase,
    result,
    scoring,
    stage: options.stage
  });

  return {
    case_id: options.caseId,
    stage: options.stage,
    status: result.status,
    scoring_status: scoring.status,
    score_failures: scoring.score_failures,
    reason: result.reason,
    model: result.model,
    transport: result.transport,
    input_mode: preparedInput.input_mode,
    env_file_status: options.env_file_status,
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
  const results: RealtimeCaseRunSummary[] = [];

  for (const caseId of caseIds) {
    results.push(
      await runRealtimeEvalCase({
        apiKey: credentials.ok ? credentials.apiKey : undefined,
        caseId,
        env_file_status,
        inputText: args.inputText,
        runStamp,
        stage: args.stage
      })
    );
  }

  const summary = summarizeRealtimeSuite({
    caseIds,
    inputText: args.inputText,
    results,
    stage: args.stage
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (shouldFailRealtimeEval(results)) {
    process.exitCode = 1;
  }
}

void main();
