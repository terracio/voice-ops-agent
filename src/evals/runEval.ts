import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetDb } from "../domain/db";
import {
  EvalCaseSchema,
  EvalModeSchema,
  type EvalCase,
  type EvalCaseResult,
  type EvalMode,
  type EvalRunReport
} from "./caseSchema";
import {
  buildEvalReport,
  renderTerminalSummary,
  writeEvalReports
} from "./report";
import { runScriptedEvalCase } from "./scriptedRunner";

export type EvalExecutorContext = {
  run_id: string;
  mode: EvalMode;
  run_started_at: string;
  now: () => string;
};

export type EvalExecutor = (
  evalCase: EvalCase,
  context: EvalExecutorContext
) => EvalCaseResult | Promise<EvalCaseResult>;

export type RunEvalOptions = {
  cases?: EvalCase[];
  mode?: EvalMode;
  reportDir?: string;
  now?: () => string;
  executor?: EvalExecutor;
  env?: Record<string, string | undefined>;
};

export type RunEvalResult = {
  report: EvalRunReport;
  terminalSummary: string;
  reportFiles: Awaited<ReturnType<typeof writeEvalReports>>;
};

const DEFAULT_EVAL_CASES: EvalCase[] = [
  {
    case_id: "harness_smoke_maya_default",
    title: "Harness smoke: reset Maya seed",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [
      {
        turn_id: "harness_smoke_maya_default_turn_001",
        actor: "system",
        text: "Validate the eval harness seed reset and report boundary."
      }
    ],
    script: [],
    tags: ["harness"]
  }
];

export async function runEval(
  options: RunEvalOptions = {}
): Promise<RunEvalResult> {
  const mode = options.mode ?? "scripted";
  const now = options.now ?? (() => new Date().toISOString());
  const env = options.env ?? process.env;

  if (mode === "model") {
    requireModelModeExecutor(env, options.executor);
  }

  const cases = (options.cases ?? DEFAULT_EVAL_CASES).map((evalCase) =>
    EvalCaseSchema.parse(evalCase)
  );
  const executor = options.executor ?? runScriptedEvalCase;
  const runStartedAt = now();
  const runId = createRunId(runStartedAt);
  const results: EvalCaseResult[] = [];

  for (const evalCase of cases) {
    if (evalCase.mode !== mode) {
      throw new Error(
        `Case ${evalCase.case_id} is ${evalCase.mode} but run mode is ${mode}.`
      );
    }

    resetDb(evalCase.seed_id);
    results.push(await executor(evalCase, {
      run_id: runId,
      mode,
      run_started_at: runStartedAt,
      now
    }));
  }

  const runFinishedAt = now();
  const report = buildEvalReport({
    run_id: runId,
    mode,
    started_at: runStartedAt,
    finished_at: runFinishedAt,
    results
  });
  const reportFiles = await writeEvalReports(report, options.reportDir);
  const terminalSummary = renderTerminalSummary(report);

  return { report, terminalSummary, reportFiles };
}

function requireModelModeExecutor(
  env: Record<string, string | undefined>,
  executor?: EvalExecutor
): void {
  if (!env.OPENAI_API_KEY) {
    throw new Error("Model eval mode requires server-side OPENAI_API_KEY.");
  }

  if (!executor) {
    throw new Error(
      "Model eval mode requires an explicit model executor; scripted mode is not used as a fallback."
    );
  }
}

function createRunId(startedAt: string): string {
  const timestamp = startedAt.replace(/\D/g, "").slice(0, 17);

  return `eval_${timestamp || "run"}`;
}

function parseMode(args: string[]): EvalMode {
  const modeFlagIndex = args.findIndex((arg) => arg === "--mode");
  const inlineMode = args.find((arg) => arg.startsWith("--mode="));
  const value = inlineMode?.slice("--mode=".length) ??
    (modeFlagIndex >= 0 ? args[modeFlagIndex + 1] : undefined) ??
    "scripted";

  return EvalModeSchema.parse(value);
}

async function main(): Promise<void> {
  try {
    const { report, terminalSummary } = await runEval({
      mode: parseMode(process.argv.slice(2)),
      env: process.env
    });

    console.log(terminalSummary);

    if (
      report.summary.cases_failed > 0 ||
      report.summary.cases_blocked > 0 ||
      report.summary.cases_errored > 0 ||
      report.summary.score_failures > 0
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.exitCode = 1;
    console.error(error instanceof Error ? error.message : String(error));
  }
}

const currentModulePath = fileURLToPath(import.meta.url);
const invokedModulePath = process.argv[1]
  ? resolve(process.argv[1])
  : undefined;

if (invokedModulePath === currentModulePath) {
  void main();
}
