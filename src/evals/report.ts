import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EvalCaseResultSchema,
  EvalRunReportSchema,
  type EvalCaseResult,
  type EvalMode,
  type EvalRunReport
} from "./caseSchema";

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

export function renderTerminalSummary(report: EvalRunReport): string {
  const summary = report.summary;

  return [
    "MealPlan VoiceOps Eval Report",
    `Run: ${report.metadata.run_id}`,
    `Mode: ${report.metadata.mode}`,
    `Cases: ${summary.cases_passed} passed, ${summary.cases_failed} failed, ` +
      `${summary.cases_blocked} blocked, ${summary.cases_errored} errored, ` +
      `${summary.cases_skipped} skipped`,
    `Score failures: ${summary.score_failures}`,
    `Hard policy violations: ${summary.hard_policy_violations}`,
    `Evidence: ${summary.evidence.scripted_operational_safety} scripted operational-safety, ` +
      `${summary.evidence.model_behavior} model-behavior`
  ].join("\n");
}

export function renderMarkdownReport(report: EvalRunReport): string {
  const lines = [
    "# MealPlan VoiceOps Eval Report",
    "",
    `- Run: \`${report.metadata.run_id}\``,
    `- Mode: \`${report.metadata.mode}\``,
    `- Cases: ${report.summary.cases_passed} passed, ` +
      `${report.summary.cases_failed} failed, ${report.summary.cases_blocked} blocked, ` +
      `${report.summary.cases_errored} errored, ${report.summary.cases_skipped} skipped`,
    `- Score failures: ${report.summary.score_failures}`,
    `- Hard policy violations: ${report.summary.hard_policy_violations}`,
    "",
    "This report distinguishes scripted operational-safety evidence from future " +
      "model-behavior evidence. Scripted mode validates the operational safety " +
      "boundary; model mode will validate agent behavior when a model executor is added.",
    "",
    "## Cases",
    "",
    "| Case | Mode | Seed | Evidence | Status | Failed scores |",
    "| --- | --- | --- | --- | --- | --- |"
  ];

  for (const result of report.results) {
    lines.push(
      `| \`${result.case_id}\` | ${result.mode} | \`${result.seed_id}\` | ` +
        `${result.evidence_kind} | ${result.status} | ${failedScoreCount(result)} |`
    );
  }

  appendFailedDiagnostics(lines, report.results);

  return `${lines.join("\n")}\n`;
}

export async function writeEvalReports(
  report: EvalRunReport,
  reportDir = "reports"
): Promise<WrittenEvalReport> {
  const jsonPath = join(reportDir, "eval-report.json");
  const markdownPath = join(reportDir, "eval-report.md");

  await mkdir(reportDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderMarkdownReport(report));

  return { jsonPath, markdownPath };
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

function appendFailedDiagnostics(
  lines: string[],
  results: EvalCaseResult[]
): void {
  const failedResults = results.filter(
    (result) => result.status !== "passed" || failedScoreCount(result) > 0
  );

  if (failedResults.length === 0) {
    return;
  }

  lines.push("", "## Failed Case Diagnostics", "");

  for (const result of failedResults) {
    lines.push(`### ${result.case_id}`, "");

    for (const score of result.scores.filter((score) => !score.passed)) {
      lines.push(`- Score \`${score.score_id}\`: ${score.message}`);
    }

    for (const diagnostic of result.diagnostics) {
      const evidence = diagnostic.evidence
        ? ` Evidence: \`${JSON.stringify(diagnostic.evidence)}\`.`
        : "";

      lines.push(
        `- ${diagnostic.severity.toUpperCase()} \`${diagnostic.code}\`: ` +
          `${diagnostic.message}.${evidence}`
      );
    }

    lines.push("");
  }
}
