import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  runRealtimeAgentSmoke
} from "../agent/realtimeRunner";
import type { RealtimeRunnerResult } from "../agent/realtimeRunnerTypes";
import { loadOpenAIServerEnv } from "../agent/realtimeRunnerSupport";

type RealtimeEvalArgs = {
  caseId: string;
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
    noEnv: args.includes("--no-env"),
    stage: readArgValue(args, "--stage") ?? "crawl"
  };
}

function writeRealtimeReports(options: {
  args: RealtimeEvalArgs;
  env_file_status: string;
  result: RealtimeRunnerResult;
}): { json_path: string; markdown_path: string } {
  mkdirSync("reports", { recursive: true });

  const jsonPath = join("reports", "realtime-eval-report.json");
  const markdownPath = join("reports", "realtime-eval-report.md");
  const eventLines = options.result.trace
    .map((event, index) =>
      `${index + 1}. ${event.at} ${event.source}:${event.type}`
    )
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
      `Status: ${options.result.status}`,
      `Model: ${options.result.model}`,
      `Transport: ${options.result.transport}`,
      `Trace events: ${options.result.trace.length}`,
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
  const result = await runRealtimeAgentSmoke({
    runId: `realtime_${args.stage}_${args.caseId}`,
    sessionId: `realtime_${args.stage}_${args.caseId}_session`,
    lastUserMessage: "Realtime smoke audio fixture.",
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
    ...writeRealtimeReports({ args, env_file_status, result })
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

void main();
