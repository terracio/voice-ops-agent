import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalRunReport } from "../caseSchema";
import type { PassKAggregate } from "./report";
import {
  appendGroupedFailureSections,
  rewardFailureCount,
  serializeEvalCaseResult
} from "./reportGrouping";
import {
  buildRunArtifactManifest,
  collectGitMetadata,
  resolveInvokedCommand,
  safeArtifactSegment,
  type EvalRunGitMetadata
} from "../shared/runArtifactMetadata";

export type ScriptedRunArtifactPaths = {
  runDir: string;
  resultsJsonPath: string;
  resultsMarkdownPath: string;
  casesDir: string;
  artifactsDir: string;
};

export async function writeScriptedRunArtifacts(options: {
  aggregate?: PassKAggregate;
  git?: EvalRunGitMetadata;
  invokedCommand?: string;
  report: EvalRunReport;
  reportDir: string;
}): Promise<ScriptedRunArtifactPaths> {
  const runDir = join(
    options.reportDir,
    "evals",
    "scripted",
    safeArtifactSegment(options.report.metadata.run_id)
  );
  const casesDir = join(runDir, "cases");
  const artifactsDir = join(runDir, "artifacts");
  const resultsJsonPath = join(runDir, "results.json");
  const resultsMarkdownPath = join(runDir, "results.md");

  await mkdir(casesDir, { recursive: true });
  await mkdir(artifactsDir, { recursive: true });

  const caseSummaries = [];
  for (const result of options.report.results) {
    const casePath = join(casesDir, `${safeArtifactSegment(result.case_id)}.json`);
    const serializedResult = serializeEvalCaseResult(result);
    await writeFile(casePath, `${JSON.stringify(serializedResult, null, 2)}\n`);
    caseSummaries.push({
      case_id: result.case_id,
      diagnostic_failures: serializedResult.diagnostic_failures.length,
      reward_basis: result.reward_basis,
      reward_failures: serializedResult.reward_failures.length,
      status: result.status,
      score_failures: result.scores.filter((score) => !score.passed).length,
      case_path: casePath
    });
  }

  const manifest = buildRunArtifactManifest({
    artifacts: {
      run_dir: runDir,
      cases_dir: casesDir,
      artifacts_dir: artifactsDir
    },
    git: options.git ?? collectGitMetadata(),
    invokedCommand: options.invokedCommand ?? resolveInvokedCommand(),
    mode: options.report.metadata.mode,
    runId: options.report.metadata.run_id,
    suite: "scripted"
  });
  const results = {
    ...manifest,
    metadata: options.report.metadata,
    summary: {
      ...options.report.summary,
      diagnostic_failures: caseSummaries.reduce(
        (total, summary) => total + summary.diagnostic_failures,
        0
      ),
      reward_failures: caseSummaries.reduce(
        (total, summary) => total + summary.reward_failures,
        0
      )
    },
    ...(options.aggregate ? { aggregate: options.aggregate } : {}),
    cases: caseSummaries,
    results: options.report.results.map(serializeEvalCaseResult)
  };

  await writeFile(resultsJsonPath, `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(resultsMarkdownPath, renderScriptedRunMarkdown({
    aggregate: options.aggregate,
    caseSummaries,
    manifest,
    report: options.report
  }));

  return { runDir, resultsJsonPath, resultsMarkdownPath, casesDir, artifactsDir };
}

function renderScriptedRunMarkdown(options: {
  aggregate?: PassKAggregate;
  caseSummaries: {
    case_id: string;
    case_path: string;
    diagnostic_failures: number;
    reward_basis: string[];
    reward_failures: number;
    score_failures: number;
    status: string;
  }[];
  manifest: ReturnType<typeof buildRunArtifactManifest>;
  report: EvalRunReport;
}): string {
  const aggregateLines = options.aggregate
    ? [
        `- Pass-k: ${options.aggregate.runs_passed}/${options.aggregate.runs_total} runs passed (k=${options.aggregate.pass_k})`,
        `- Case executions: ${options.aggregate.case_executions}`
      ]
    : [];
  const lines = [
    "# MealPlan VoiceOps Scripted Eval Run",
    "",
    `- Run: \`${options.manifest.run_id}\``,
    `- Suite: \`${options.manifest.suite}\``,
    `- Mode: \`${options.report.metadata.mode}\``,
    `- Started: ${options.report.metadata.started_at}`,
    `- Finished: ${options.report.metadata.finished_at}`,
    `- Cases: ${options.report.summary.cases_passed} passed, ` +
      `${options.report.summary.cases_failed} failed, ` +
      `${options.report.summary.cases_blocked} blocked, ` +
      `${options.report.summary.cases_errored} errored, ` +
      `${options.report.summary.cases_skipped} skipped`,
    `- Score failures: ${options.report.summary.score_failures}`,
    `- Reward failures: ${options.report.results.reduce(
      (total, result) => total + rewardFailureCount(result),
      0
    )}`,
    `- Hard policy violations: ${options.report.summary.hard_policy_violations}`,
    ...aggregateLines,
    "",
    "This run contains scripted operational-safety evidence. Scripted mode validates " +
      "the backend safety boundary without model variability.",
    "",
    "## Artifacts",
    "",
    `- Run directory: \`${options.manifest.artifacts.run_dir}\``,
    `- Cases directory: \`${options.manifest.artifacts.cases_dir}\``,
    `- Artifacts directory: \`${options.manifest.artifacts.artifacts_dir}\``,
    "",
    "## Cases",
    "",
    "| Case | Reward basis | Status | Reward failures | Diagnostic failures | Raw score failures | Case artifact |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const summary of options.caseSummaries) {
    lines.push(
      `| \`${summary.case_id}\` | ${summary.reward_basis.join(", ")} | ` +
        `${summary.status} | ` +
        `${summary.reward_failures} | ${summary.diagnostic_failures} | ` +
        `${summary.score_failures} | \`${summary.case_path}\` |`
    );
  }

  appendGroupedFailureSections(lines, options.report.results);

  return `${lines.join("\n")}\n`;
}
