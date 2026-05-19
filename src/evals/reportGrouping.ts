import type { EvalCaseResult, EvalRunReport } from "./caseSchema";
import {
  buildScriptedRewardAggregation,
  normalizeRawScores
} from "./rewardAggregation";
import type { RewardAggregation } from "./rewardAggregationTypes";

export type SerializedEvalCaseResult =
  Omit<EvalCaseResult, "diagnostics"> & {
    diagnostic_failures: RewardAggregation["diagnostic_failures"];
    diagnostics: RewardAggregation["diagnostics"];
    primary_rewards: RewardAggregation["primary_rewards"];
    raw_diagnostics: EvalCaseResult["diagnostics"];
    raw_scores: ReturnType<typeof normalizeRawScores>;
    reward_evaluation: RewardAggregation;
    reward_failures: RewardAggregation["reward_failures"];
    reward_passed: boolean;
    reward_score: number;
  };

export type SerializedEvalRunReport = Omit<EvalRunReport, "results"> & {
  results: SerializedEvalCaseResult[];
  summary: EvalRunReport["summary"] & {
    diagnostic_failures: number;
    reward_failures: number;
  };
};

export function buildCaseRewardAggregation(
  result: EvalCaseResult
): RewardAggregation {
  return buildScriptedRewardAggregation({
    rewardBasis: result.reward_basis,
    scores: result.scores
  });
}

export function serializeEvalCaseResult(
  result: EvalCaseResult
): SerializedEvalCaseResult {
  const aggregation = buildCaseRewardAggregation(result);
  return {
    ...result,
    diagnostic_failures: aggregation.diagnostic_failures,
    diagnostics: aggregation.diagnostics,
    primary_rewards: aggregation.primary_rewards,
    raw_diagnostics: result.diagnostics,
    raw_scores: normalizeRawScores(result.scores),
    reward_evaluation: aggregation,
    reward_failures: aggregation.reward_failures,
    reward_passed: aggregation.reward_passed,
    reward_score: aggregation.reward_score
  };
}

export function serializeEvalRunReport(
  report: EvalRunReport
): SerializedEvalRunReport {
  const results = report.results.map(serializeEvalCaseResult);
  return {
    ...report,
    summary: {
      ...report.summary,
      diagnostic_failures: results.reduce(
        (total, result) => total + result.diagnostic_failures.length,
        0
      ),
      reward_failures: results.reduce(
        (total, result) => total + result.reward_failures.length,
        0
      )
    },
    results
  };
}

export function countRewardFailures(results: EvalCaseResult[]): number {
  return results.reduce(
    (total, result) =>
      total + buildCaseRewardAggregation(result).reward_failures.length,
    0
  );
}

export function rewardFailureCount(result: EvalCaseResult): number {
  return buildCaseRewardAggregation(result).reward_failures.length;
}

export function diagnosticFailureCount(result: EvalCaseResult): number {
  return buildCaseRewardAggregation(result).diagnostic_failures.length;
}

export function appendGroupedFailureSections(
  lines: string[],
  results: EvalCaseResult[]
): void {
  appendPrimaryRewardFailures(lines, results);
  appendDiagnosticFailures(lines, results);
  appendRawScoreFailures(lines, results);
}

function appendPrimaryRewardFailures(
  lines: string[],
  results: EvalCaseResult[]
): void {
  lines.push("", "## Primary Reward Failures", "");
  const failures = results.flatMap((result) => {
    const aggregation = buildCaseRewardAggregation(result);
    return aggregation.reward_failures.map((failure) => ({
      case_id: result.case_id,
      failure
    }));
  });

  if (failures.length === 0) {
    lines.push("No primary reward failures.", "");
    return;
  }

  for (const { case_id, failure } of failures) {
    lines.push(
      `- \`${case_id}\` ${failure.kind} \`${failure.key}\` ` +
        `score ${formatScore(failure.score)} ` +
        `(raw: ${failure.raw_score_ids.join(", ") || "none"})`
    );
  }
}

function appendDiagnosticFailures(
  lines: string[],
  results: EvalCaseResult[]
): void {
  lines.push("", "## Diagnostics", "");
  const hadGroupedFailure = appendGroupedDiagnostics(lines, results);
  const hadRawDiagnostic = appendRawDiagnostics(lines, results);
  if (!hadGroupedFailure && !hadRawDiagnostic) {
    lines.push("No diagnostic-only failures.", "");
  }
}

function appendGroupedDiagnostics(
  lines: string[],
  results: EvalCaseResult[]
): boolean {
  let appended = false;
  for (const result of results) {
    const aggregation = buildCaseRewardAggregation(result);
    for (const failure of aggregation.diagnostic_failures) {
      lines.push(
        `- \`${result.case_id}\` diagnostic \`${failure.key}\` ` +
          `score ${formatScore(failure.score)} ` +
          `(raw: ${failure.raw_score_ids.join(", ") || "none"})`
      );
      appended = true;
    }
  }
  return appended;
}

function appendRawDiagnostics(
  lines: string[],
  results: EvalCaseResult[]
): boolean {
  let appended = false;
  for (const result of results) {
    for (const diagnostic of result.diagnostics) {
      const evidence = diagnostic.evidence
        ? ` Evidence: \`${JSON.stringify(diagnostic.evidence)}\`.`
        : "";
      lines.push(
        `- \`${result.case_id}\` ${diagnostic.severity.toUpperCase()} ` +
          `\`${diagnostic.code}\`: ${diagnostic.message}.${evidence}`
      );
      appended = true;
    }
  }
  return appended;
}

function appendRawScoreFailures(
  lines: string[],
  results: EvalCaseResult[]
): void {
  lines.push("", "## Raw Score Failures", "");
  const failedScores = results.flatMap((result) =>
    result.scores
      .filter((score) => !score.passed)
      .map((score) => ({ case_id: result.case_id, score }))
  );

  if (failedScores.length === 0) {
    lines.push("No raw score failures.", "");
    return;
  }

  for (const { case_id, score } of failedScores) {
    lines.push(
      `- \`${case_id}\` score \`${score.score_id}\` ` +
        `(${score.category}): ${score.message}`
    );
  }
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
}
