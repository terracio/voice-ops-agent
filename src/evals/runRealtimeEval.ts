import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  runRealtimeAgentSmoke
} from "../agent/realtimeRunner";
import type {
  RealtimeRunnerResult,
  RealtimeTranscriptFragment
} from "../agent/realtimeRunnerTypes";
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
import {
  renderRealtimeCrawlScores,
  scoreRealtimeCrawlCase
} from "./realtime/scorer";
import type { RealtimeCrawlScoring } from "./realtime/scorerTypes";
import { synthesizeOpenAiSpeechPcm } from "./realtime/tts";

type RealtimeEvalArgs = {
  caseId: string;
  inputText?: string;
  noEnv: boolean;
  stage: string;
};

type PreparedRealtimeInput = {
  audio?: ArrayBuffer;
  audio_metadata?: Record<string, unknown>;
  input_mode: "audio" | "text";
  input_text: string;
  inputText?: string;
};

function readArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function parseArgs(args: string[]): RealtimeEvalArgs {
  return {
    caseId: readArgValue(args, "--case") ?? "maya_smoke",
    inputText: readArgValue(args, "--input-text"),
    noEnv: args.includes("--no-env"),
    stage: readArgValue(args, "--stage") ?? "crawl"
  };
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function createRunStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:.]/g, "");
}

function isFinalTranscriptFragment(fragment: RealtimeTranscriptFragment): boolean {
  return (
    fragment.source_event_type ===
      "conversation.item.input_audio_transcription.completed" ||
    fragment.source_event_type.endsWith(".done")
  );
}

function collapseTranscriptDeltas(
  fragments: RealtimeTranscriptFragment[]
): RealtimeTranscriptFragment[] {
  const collapsed: RealtimeTranscriptFragment[] = [];

  for (const fragment of fragments) {
    const previous = collapsed.at(-1);
    const fragmentKey = `${fragment.role}:${fragment.response_id ?? fragment.item_id ?? ""}`;
    const previousKey = previous
      ? `${previous.role}:${previous.response_id ?? previous.item_id ?? ""}`
      : undefined;

    if (previous && previousKey === fragmentKey) {
      previous.text += fragment.text;
      continue;
    }
    collapsed.push({ ...fragment });
  }

  return collapsed;
}

function readableTranscriptFragments(
  fragments: RealtimeTranscriptFragment[]
): RealtimeTranscriptFragment[] {
  const finalFragments = fragments.filter(isFinalTranscriptFragment);
  return finalFragments.length > 0
    ? finalFragments
    : collapseTranscriptDeltas(fragments);
}

async function prepareRealtimeInput(options: {
  apiKey?: string;
  realtimeCase: RealtimeEvalCase;
}): Promise<PreparedRealtimeInput> {
  if (options.realtimeCase.input.mode === "text") {
    return {
      input_mode: "text",
      input_text: options.realtimeCase.input.text,
      inputText: options.realtimeCase.input.text
    };
  }

  const audio = options.apiKey
    ? await synthesizeOpenAiSpeechPcm({
      apiKey: options.apiKey,
      input: options.realtimeCase.input.text,
      model: options.realtimeCase.audio.model,
      voice: options.realtimeCase.audio.voice,
      instructions: options.realtimeCase.audio.instructions,
      speed: options.realtimeCase.audio.speed
    })
    : undefined;

  return {
    audio,
    input_mode: "audio",
    input_text: options.realtimeCase.input.text,
    audio_metadata: {
      source: options.realtimeCase.audio.source,
      fixture_mode: options.realtimeCase.audio.fixture_mode,
      stable_for_gating: options.realtimeCase.audio.stable_for_gating,
      model: options.realtimeCase.audio.model,
      voice: options.realtimeCase.audio.voice,
      response_format: options.realtimeCase.audio.response_format,
      sample_rate_hz: options.realtimeCase.audio.sample_rate_hz,
      chunk_duration_ms: options.realtimeCase.audio.chunk_duration_ms,
      expected_duration_ms: options.realtimeCase.audio.expected_duration_ms,
      byte_length: audio?.byteLength
    }
  };
}

function writeRealtimeReports(options: {
  args: RealtimeEvalArgs;
  env_file_status: string;
  preparedInput: PreparedRealtimeInput;
  realtimeCase: RealtimeEvalCase;
  result: RealtimeRunnerResult;
  scoring: RealtimeCrawlScoring;
}): { json_path: string; markdown_path: string } {
  const reportDir = join(
    "reports",
    "realtime",
    safePathSegment(options.args.stage),
    safePathSegment(options.args.caseId),
    safePathSegment(options.result.run_id)
  );
  mkdirSync(reportDir, { recursive: true });

  const jsonPath = join(reportDir, "report.json");
  const markdownPath = join(reportDir, "report.md");
  const eventLines = options.result.trace
    .map((event, index) =>
      `${index + 1}. ${event.at} ${event.source}:${event.type}`
    )
    .join("\n");
  const toolLines = options.result.tool_calls
    .map((toolCall, index) => {
      const policy = toolCall.policy_id ? ` policy=${toolCall.policy_id}` : "";
      return `${index + 1}. ${toolCall.tool_name} ${toolCall.status}${policy}`;
    })
    .join("\n");
  const transcriptLines = readableTranscriptFragments(
    options.result.transcript_fragments
  )
    .map((fragment, index) => {
      return `${index + 1}. ${fragment.role}: ${fragment.text}`;
    })
    .join("\n");

  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        case_id: options.args.caseId,
        stage: options.args.stage,
        seed_id: options.realtimeCase.seed_id,
        input_mode: options.preparedInput.input_mode,
        input_text: options.preparedInput.input_text,
        audio_metadata: options.preparedInput.audio_metadata,
        expected: options.realtimeCase.expected,
        scoring: options.scoring,
        env_file_status: options.env_file_status,
        ...options.result
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    markdownPath,
    [
      "# Realtime Eval Smoke Report",
      "",
      `Case: ${options.args.caseId}`,
      `Stage: ${options.args.stage}`,
      `Run: ${options.result.run_id}`,
      `Seed: ${options.realtimeCase.seed_id}`,
      `Input mode: ${options.preparedInput.input_mode}`,
      `Status: ${options.result.status}`,
      `Model: ${options.result.model}`,
      `Transport: ${options.result.transport}`,
      `Trace events: ${options.result.trace.length}`,
      `Tool calls: ${options.result.tool_calls.length}`,
      `Audit events: ${options.result.audit_events.length}`,
      `Transcript fragments: ${options.result.transcript_fragments.length}`,
      `Scoring status: ${options.scoring.status}`,
      `Score failures: ${options.scoring.score_failures}`,
      "",
      "## Fixture",
      "",
      `Input text: ${options.preparedInput.input_text}`,
      options.preparedInput.audio_metadata
        ? `Audio: ${JSON.stringify(options.preparedInput.audio_metadata)}`
        : "Audio: not used",
      "",
      "## Transcript",
      "",
      transcriptLines || "No transcript fragments captured.",
      "",
      `Raw transcript fragments: ${options.result.transcript_fragments.length}`,
      "",
      "## Scoring",
      "",
      renderRealtimeCrawlScores(options.scoring),
      "",
      "## Tool Calls",
      "",
      toolLines || "No tool calls captured.",
      "",
      "## Event Timeline",
      "",
      eventLines || "No events captured."
    ].join("\n")
  );

  return { json_path: jsonPath, markdown_path: markdownPath };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env_file_status = args.noEnv ? "skipped" : loadOpenAIServerEnv();
  const realtimeCase = args.inputText
    ? createTextRealtimeEvalCase({
      caseId: args.caseId,
      stage: args.stage,
      text: args.inputText
    })
    : loadRealtimeEvalCase({ caseId: args.caseId, stage: args.stage });
  resetDb(realtimeCase.seed_id);

  const credentials = resolveOpenAIRealtimeCredentials({
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL
    }
  });
  const preparedInput = await prepareRealtimeInput({
    apiKey: credentials.ok ? credentials.apiKey : undefined,
    realtimeCase
  });
  const runStamp = createRunStamp();
  const runId = [
    "realtime",
    safePathSegment(args.stage),
    safePathSegment(args.caseId),
    runStamp
  ].join("_");
  const result = await runRealtimeAgentSmoke({
    runId,
    sessionId: `${runId}_session`,
    lastUserMessage: realtimeCase.input.text,
    audio: preparedInput.audio,
    audioChunkDurationMs: realtimeCase.audio.chunk_duration_ms,
    inputText: preparedInput.inputText,
    settleMs: 750,
    timeoutMs: 20_000
  });
  const scoring = scoreRealtimeCrawlCase(realtimeCase, result);

  const summary = {
    case_id: args.caseId,
    stage: args.stage,
    status: result.status,
    scoring_status: scoring.status,
    score_failures: scoring.score_failures,
    reason: result.reason,
    model: result.model,
    transport: result.transport,
    input_mode: preparedInput.input_mode,
    env_file_status,
    trace_event_count: result.trace.length,
    transcript_fragment_count: result.transcript_fragments.length,
    tool_call_count: result.tool_calls.length,
    audit_event_count: result.audit_events.length,
    ...writeRealtimeReports({
      args,
      env_file_status,
      preparedInput,
      realtimeCase,
      result,
      scoring
    })
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (
    result.status === "failed" ||
    result.status === "timed_out" ||
    (result.status === "completed" && scoring.status === "failed")
  ) {
    process.exitCode = 1;
  }
}

void main();
