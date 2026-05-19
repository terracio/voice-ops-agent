import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetDb } from "../domain/db";
import {
  EvalCaseSchema,
  EvalModeSchema,
  type EvalCase,
  type EvalCaseInput,
  type EvalCaseResult,
  type EvalMode,
  type EvalRunReport
} from "./caseSchema";
import {
  buildPassKAggregate,
  buildEvalReport,
  renderTerminalSummary,
  writeEvalReports,
  type PassKAggregate
} from "./report";
import { scoreCase } from "./scoreCase";
import { runScriptedEvalCase } from "./scriptedRunner";
import { firstTenCases, remainingTenCases } from "./cases";

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
  cases?: EvalCaseInput[];
  mode?: EvalMode;
  reportDir?: string;
  now?: () => string;
  executor?: EvalExecutor;
  env?: Record<string, string | undefined>;
  passK?: number;
};

export type RunEvalResult = {
  report: EvalRunReport;
  terminalSummary: string;
  reportFiles: Awaited<ReturnType<typeof writeEvalReports>>;
  passKAggregate?: PassKAggregate;
};

const DEFAULT_EVAL_CASES: EvalCaseInput[] = [
  ...firstTenCases,
  ...remainingTenCases
];

export async function runEval(
  options: RunEvalOptions = {}
): Promise<RunEvalResult> {
  const mode = options.mode ?? "scripted";
  const now = options.now ?? (() => new Date().toISOString());
  const env = options.env ?? process.env;
  const passK = parsePassKValue(options.passK ?? 1);

  if (mode === "model") {
    requireModelModeExecutor(env, options.executor);
  }

  const cases = (options.cases ?? DEFAULT_EVAL_CASES).map((evalCase) =>
    EvalCaseSchema.parse(evalCase)
  );
  const executor = options.executor ?? runScriptedEvalCase;
  const reports: EvalRunReport[] = [];

  for (let iteration = 1; iteration <= passK; iteration += 1) {
    const runStartedAt = now();
    reports.push(await executeEvalRun({
      cases,
      mode,
      now,
      executor,
      runStartedAt,
      runId: createRunId(runStartedAt, passK > 1 ? iteration : undefined)
    }));
  }

  const report = passK === 1 ? reports[0] as EvalRunReport : buildEvalReport({
    run_id: createAggregateRunId(reports[0]?.metadata.started_at ?? now(), passK),
    mode,
    started_at: reports[0]?.metadata.started_at ?? now(),
    finished_at: reports.at(-1)?.metadata.finished_at ?? now(),
    results: reports.flatMap((singleReport) => singleReport.results)
  });
  const passKAggregate = passK === 1
    ? undefined
    : buildPassKAggregate(reports, passK);
  const reportFiles = await writeEvalReports(
    report,
    options.reportDir,
    passKAggregate
  );
  const terminalSummary = renderTerminalSummary(report, passKAggregate);

  return { report, terminalSummary, reportFiles, passKAggregate };
}

async function executeEvalRun(input: {
  cases: EvalCase[];
  mode: EvalMode;
  now: () => string;
  executor: EvalExecutor;
  runStartedAt: string;
  runId: string;
}): Promise<EvalRunReport> {
  const results: EvalCaseResult[] = [];

  for (const evalCase of input.cases) {
    if (evalCase.mode !== input.mode) {
      throw new Error(
        `Case ${evalCase.case_id} is ${evalCase.mode} but run mode is ${input.mode}.`
      );
    }

    resetDb(evalCase.seed_id);
    const result = await input.executor(evalCase, {
      run_id: input.runId,
      mode: input.mode,
      run_started_at: input.runStartedAt,
      now: input.now
    });

    results.push(scoreCase(evalCase, result));
  }

  const runFinishedAt = input.now();
  return buildEvalReport({
    run_id: input.runId,
    mode: input.mode,
    started_at: input.runStartedAt,
    finished_at: runFinishedAt,
    results
  });
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

function createRunId(startedAt: string, iteration?: number): string {
  const timestamp = startedAt.replace(/\D/g, "").slice(0, 17);

  return `eval_${timestamp || "run"}${iteration ? `_p${iteration}` : ""}`;
}

function createAggregateRunId(startedAt: string, passK: number): string {
  return `${createRunId(startedAt)}_passk${passK}`;
}

function parseMode(args: string[]): EvalMode {
  const modeFlagIndex = args.findIndex((arg) => arg === "--mode");
  const inlineMode = args.find((arg) => arg.startsWith("--mode="));
  const value = inlineMode?.slice("--mode=".length) ??
    (modeFlagIndex >= 0 ? args[modeFlagIndex + 1] : undefined) ??
    "scripted";

  return EvalModeSchema.parse(value);
}

function parsePassK(args: string[]): number {
  const flagIndex = args.findIndex((arg) => arg === "--pass-k");
  const inline = args.find((arg) => arg.startsWith("--pass-k="));
  const value = inline?.slice("--pass-k=".length) ??
    (flagIndex >= 0 ? args[flagIndex + 1] : undefined) ??
    "1";

  return parsePassKValue(Number(value));
}

function parsePassKValue(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("--pass-k must be a positive integer.");
  }

  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  try {
    const { report, terminalSummary } = await runEval({
      mode: parseMode(args),
      passK: parsePassK(args),
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
