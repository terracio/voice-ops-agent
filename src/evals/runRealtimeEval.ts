import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  runRealtimeAgentSmoke
} from "../agent/realtimeRunner";
import type {
  RealtimeRunnerResult,
  RealtimeTranscriptFragment
} from "../agent/realtimeRunnerTypes";
import { loadOpenAIServerEnv } from "../agent/realtimeRunnerSupport";

type RealtimeEvalArgs = {
  caseId: string;
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

function writeRealtimeReports(options: {
  args: RealtimeEvalArgs;
  env_file_status: string;
  result: RealtimeRunnerResult;
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
      `Status: ${options.result.status}`,
      `Model: ${options.result.model}`,
      `Transport: ${options.result.transport}`,
      `Trace events: ${options.result.trace.length}`,
      `Tool calls: ${options.result.tool_calls.length}`,
      `Audit events: ${options.result.audit_events.length}`,
      `Transcript fragments: ${options.result.transcript_fragments.length}`,
      "",
      "## Transcript",
      "",
      transcriptLines || "No transcript fragments captured.",
      "",
      `Raw transcript fragments: ${options.result.transcript_fragments.length}`,
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
    lastUserMessage: "Realtime smoke audio fixture.",
    inputText: args.inputText,
    timeoutMs: 20_000
  });

  const summary = {
    case_id: args.caseId,
    stage: args.stage,
    status: result.status,
    reason: result.reason,
    model: result.model,
    transport: result.transport,
    env_file_status,
    trace_event_count: result.trace.length,
    transcript_fragment_count: result.transcript_fragments.length,
    tool_call_count: result.tool_calls.length,
    audit_event_count: result.audit_events.length,
    ...writeRealtimeReports({ args, env_file_status, result })
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

void main();
