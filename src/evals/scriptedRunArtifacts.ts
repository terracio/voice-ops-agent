import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalRunReport } from "./caseSchema";
import type { PassKAggregate } from "./report";
import {
  buildRunArtifactManifest,
  collectGitMetadata,
  resolveInvokedCommand,
  safeArtifactSegment,
  type EvalRunGitMetadata
} from "./runArtifactMetadata";

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
  legacyJsonPath: string;
  legacyMarkdownPath: string;
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
    await writeFile(casePath, `${JSON.stringify(result, null, 2)}\n`);
    caseSummaries.push({
      case_id: result.case_id,
      reward_basis: result.reward_basis,
      status: result.status,
      score_failures: result.scores.filter((score) => !score.passed).length,
      case_path: casePath
    });
  }

  const manifest = buildRunArtifactManifest({
    artifacts: {
      run_dir: runDir,
      cases_dir: casesDir,
      artifacts_dir: artifactsDir,
      legacy_report_json: options.legacyJsonPath,
      legacy_report_markdown: options.legacyMarkdownPath
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
    summary: options.report.summary,
    ...(options.aggregate ? { aggregate: options.aggregate } : {}),
    cases: caseSummaries,
    results: options.report.results
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
    reward_basis: string[];
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
    `- Hard policy violations: ${options.report.summary.hard_policy_violations}`,
    ...aggregateLines,
    "",
    "## Artifacts",
    "",
    `- Run directory: \`${options.manifest.artifacts.run_dir}\``,
    `- Cases directory: \`${options.manifest.artifacts.cases_dir}\``,
    `- Artifacts directory: \`${options.manifest.artifacts.artifacts_dir}\``,
    `- Legacy JSON: \`${options.manifest.artifacts.legacy_report_json}\``,
    `- Legacy Markdown: \`${options.manifest.artifacts.legacy_report_markdown}\``,
    "",
    "## Cases",
    "",
    "| Case | Reward basis | Status | Failed scores | Case artifact |",
    "| --- | --- | --- | --- | --- |"
  ];

  for (const summary of options.caseSummaries) {
    lines.push(
      `| \`${summary.case_id}\` | ${summary.reward_basis.join(", ")} | ` +
        `${summary.status} | ` +
        `${summary.score_failures} | \`${summary.case_path}\` |`
    );
  }

  return `${lines.join("\n")}\n`;
}
