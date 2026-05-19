import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EvalCaseResultSchema,
  EvalRunReportSchema,
  type EvalCaseResult,
  type EvalMode,
  type EvalRunReport
} from "./caseSchema";
import {
  writeScriptedRunArtifacts,
  type ScriptedRunArtifactPaths
} from "./scriptedRunArtifacts";
import {
  appendGroupedFailureSections,
  countRewardFailures,
  diagnosticFailureCount,
  rewardFailureCount,
  serializeEvalRunReport
} from "./reportGrouping";

export type BuildEvalReportInput = {
  run_id: string;
  mode: EvalMode;
  started_at: string;
  finished_at: string;
  results: EvalCaseResult[];
};

export type WrittenEvalReport = {
  jsonPath: string;
  markdownPath: string;
  runArtifacts: ScriptedRunArtifactPaths;
};

export type PassKAggregate = {
  pass_k: number;
  runs_total: number;
  runs_passed: number;
  runs_failed: number;
  case_executions: number;
  score_failures: number;
  reward_failures: number;
  hard_policy_violations: number;
};

export function buildEvalReport(input: BuildEvalReportInput): EvalRunReport {
  const results = input.results.map((result) =>
    EvalCaseResultSchema.parse(result)
  );
  const scoreFailures = results.flatMap((result) =>
    result.scores.filter((score) => !score.passed)
  );
  const hardPolicyViolations = scoreFailures.filter(
    (score) => score.category === "hard_policy"
  );
  const durationMs = Math.max(
    0,
    Date.parse(input.finished_at) - Date.parse(input.started_at)
  );

  return EvalRunReportSchema.parse({
    metadata: {
      report_schema_version: 1,
      run_id: input.run_id,
      mode: input.mode,
      started_at: input.started_at,
      finished_at: input.finished_at,
      duration_ms: durationMs
    },
    summary: {
      cases_total: results.length,
      cases_passed: countStatus(results, "passed"),
      cases_failed: countStatus(results, "failed"),
      cases_blocked: countStatus(results, "blocked"),
      cases_errored: countStatus(results, "errored"),
      cases_skipped: countStatus(results, "skipped"),
      score_failures: scoreFailures.length,
      hard_policy_violations: hardPolicyViolations.length,
      evidence: {
        scripted_operational_safety: countEvidence(
          results,
          "scripted_operational_safety"
        ),
        model_behavior: countEvidence(results, "model_behavior")
      }
    },
    results
  });
}

export function buildPassKAggregate(
  reports: EvalRunReport[],
  passK: number
): PassKAggregate {
  const failedReports = reports.filter(reportHasRewardFailures);
  return {
    pass_k: passK,
    runs_total: reports.length,
    runs_passed: reports.length - failedReports.length,
    runs_failed: failedReports.length,
    case_executions: reports.reduce((total, report) => total + report.summary.cases_total, 0),
    score_failures: reports.reduce((total, report) => total + report.summary.score_failures, 0),
    reward_failures: reports.reduce(
      (total, report) => total + countRewardFailures(report.results),
      0
    ),
    hard_policy_violations: reports.reduce((total, report) => total + report.summary.hard_policy_violations, 0)
  };
}

export function renderTerminalSummary(
  report: EvalRunReport,
  aggregate?: PassKAggregate
): string {
  const summary = report.summary;
  const aggregateLines = aggregate
    ? [
        `Pass-k: ${aggregate.runs_passed}/${aggregate.runs_total} runs passed (k=${aggregate.pass_k})`,
        `Case executions: ${aggregate.case_executions}`,
        `Aggregate score failures: ${aggregate.score_failures}`,
        `Aggregate reward failures: ${aggregate.reward_failures}`,
        `Aggregate hard policy violations: ${aggregate.hard_policy_violations}`
      ]
    : [];
  const rewardFailures = countRewardFailures(report.results);

  return [
    "MealPlan VoiceOps Eval Report",
    `Run: ${report.metadata.run_id}`,
    `Mode: ${report.metadata.mode}`,
    ...aggregateLines,
    `Cases: ${summary.cases_passed} passed, ${summary.cases_failed} failed, ` +
      `${summary.cases_blocked} blocked, ${summary.cases_errored} errored, ` +
      `${summary.cases_skipped} skipped`,
    `Reward failures: ${rewardFailures}`,
    `Score failures: ${summary.score_failures}`,
    `Hard policy violations: ${summary.hard_policy_violations}`,
    `Evidence: ${summary.evidence.scripted_operational_safety} scripted operational-safety, ` +
      `${summary.evidence.model_behavior} model-behavior`
  ].join("\n");
}

export function renderMarkdownReport(
  report: EvalRunReport,
  aggregate?: PassKAggregate
): string {
  const lines = [
    "# MealPlan VoiceOps Eval Report",
    "",
    `- Run: \`${report.metadata.run_id}\``,
    `- Mode: \`${report.metadata.mode}\``,
    `- Cases: ${report.summary.cases_passed} passed, ` +
      `${report.summary.cases_failed} failed, ${report.summary.cases_blocked} blocked, ` +
      `${report.summary.cases_errored} errored, ${report.summary.cases_skipped} skipped`,
    `- Reward failures: ${countRewardFailures(report.results)}`,
    `- Score failures: ${report.summary.score_failures}`,
    `- Hard policy violations: ${report.summary.hard_policy_violations}`,
    ...(aggregate ? [
      `- Pass-k: ${aggregate.runs_passed}/${aggregate.runs_total} runs passed (k=${aggregate.pass_k})`,
      `- Case executions: ${aggregate.case_executions}`
    ] : []),
    "",
    "This report distinguishes scripted operational-safety evidence from future " +
      "model-behavior evidence. Scripted mode validates the operational safety " +
      "boundary; model mode will validate agent behavior when a model executor is added.",
    "",
    "## Cases",
    "",
    "| Case | Mode | Seed | Reward basis | Evidence | Status | Reward failures | Diagnostic failures | Raw score failures |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const result of report.results) {
    lines.push(
      `| \`${result.case_id}\` | ${result.mode} | \`${result.seed_id}\` | ` +
        `${renderRewardBasis(result.reward_basis)} | ${result.evidence_kind} | ` +
        `${result.status} | ${rewardFailureCount(result)} | ` +
        `${diagnosticFailureCount(result)} | ${failedScoreCount(result)} |`
    );
  }

  appendGroupedFailureSections(lines, report.results);

  return `${lines.join("\n")}\n`;
}

export async function writeEvalReports(
  report: EvalRunReport,
  reportDir = "reports",
  aggregate?: PassKAggregate
): Promise<WrittenEvalReport> {
  const jsonPath = join(reportDir, "eval-report.json");
  const markdownPath = join(reportDir, "eval-report.md");
  const markdown = renderMarkdownReport(report, aggregate);

  await mkdir(reportDir, { recursive: true });
  await writeFile(
    jsonPath,
    `${JSON.stringify(serializeEvalRunReport(report), null, 2)}\n`
  );
  await writeFile(markdownPath, markdown);

  const runArtifacts = await writeScriptedRunArtifacts({
    aggregate,
    legacyJsonPath: jsonPath,
    legacyMarkdownPath: markdownPath,
    report,
    reportDir
  });

  return { jsonPath, markdownPath, runArtifacts };
}

function countStatus(
  results: EvalCaseResult[],
  status: EvalCaseResult["status"]
): number {
  return results.filter((result) => result.status === status).length;
}

function countEvidence(
  results: EvalCaseResult[],
  evidenceKind: EvalCaseResult["evidence_kind"]
): number {
  return results.filter((result) => result.evidence_kind === evidenceKind)
    .length;
}

function failedScoreCount(result: EvalCaseResult): number {
  return result.scores.filter((score) => !score.passed).length;
}

function renderRewardBasis(rewardBasis: EvalCaseResult["reward_basis"]): string {
  return rewardBasis.join(", ");
}

function reportHasRewardFailures(report: EvalRunReport): boolean {
  return report.summary.cases_failed > 0 ||
    report.summary.cases_blocked > 0 ||
    report.summary.cases_errored > 0 ||
    countRewardFailures(report.results) > 0;
}
