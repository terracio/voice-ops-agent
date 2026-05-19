import {
  buildRealtimeRewardAggregation,
  normalizeRawScores
} from "../rewardAggregation";
import type { RewardAggregation } from "../rewardAggregationTypes";
import type { RealtimeEvalCase } from "./caseLoader";
import type { RealtimeCrawlScoring } from "./scorerTypes";

export type SerializedRealtimeScoring =
  Omit<RealtimeCrawlScoring, "diagnostics"> & {
    diagnostic_failures: RewardAggregation["diagnostic_failures"];
    diagnostics: RewardAggregation["diagnostics"];
    primary_rewards: RewardAggregation["primary_rewards"];
    raw_diagnostics: RealtimeCrawlScoring["diagnostics"];
    raw_scores: ReturnType<typeof normalizeRawScores>;
    reward_evaluation: RewardAggregation;
    reward_failures: RewardAggregation["reward_failures"];
    reward_passed: boolean;
    reward_score: number;
  };

export function buildRealtimeScoringAggregation(input: {
  realtimeCase: Pick<RealtimeEvalCase, "reward_basis">;
  scoring: RealtimeCrawlScoring;
}): RewardAggregation {
  return input.scoring.reward_evaluation ?? buildRealtimeRewardAggregation({
    rewardBasis: input.realtimeCase.reward_basis,
    scores: input.scoring.scores
  });
}

export function serializeRealtimeScoring(input: {
  realtimeCase: Pick<RealtimeEvalCase, "reward_basis">;
  scoring: RealtimeCrawlScoring;
}): SerializedRealtimeScoring {
  const aggregation = buildRealtimeScoringAggregation(input);
  return {
    ...input.scoring,
    diagnostic_failures: aggregation.diagnostic_failures,
    diagnostics: aggregation.diagnostics,
    primary_rewards: aggregation.primary_rewards,
    raw_diagnostics: input.scoring.diagnostics,
    raw_scores: normalizeRawScores(input.scoring.scores),
    reward_evaluation: aggregation,
    reward_failures: aggregation.reward_failures,
    reward_passed: aggregation.reward_passed,
    reward_score: aggregation.reward_score
  };
}

export function renderRealtimeRewardSections(input: {
  realtimeCase: Pick<RealtimeEvalCase, "reward_basis">;
  scoring: RealtimeCrawlScoring;
}): string {
  const serialized = serializeRealtimeScoring(input);
  return [
    "## Primary Rewards",
    "",
    `Reward passed: ${serialized.reward_passed}`,
    `Reward score: ${formatScore(serialized.reward_score)}`,
    `Reward failures: ${serialized.reward_failures.length}`,
    ...serialized.reward_failures.map((failure) =>
      `- ${failure.kind} \`${failure.key}\` score ${formatScore(failure.score)}`
    ),
    "",
    "## Diagnostics",
    "",
    `Diagnostic-only failures: ${serialized.diagnostic_failures.length}`,
    ...serialized.diagnostic_failures.map((failure) =>
      `- \`${failure.key}\` score ${formatScore(failure.score)}`
    ),
    `Cost: ${renderDiagnosticAvailability(serialized, "cost")}`,
    `Latency: ${renderDiagnosticAvailability(serialized, "latency")}`,
    "",
    "## Raw Score Failures",
    "",
    ...rawScoreFailureLines(serialized)
  ].join("\n");
}

function rawScoreFailureLines(
  scoring: SerializedRealtimeScoring
): string[] {
  const failures = scoring.raw_scores.filter((score) => !score.passed);
  if (failures.length === 0) return ["No raw score failures."];
  return failures.map((score) => {
    const failure = score.failure_type ? ` (${score.failure_type})` : "";
    return `- \`${score.score_id}\`${failure}: ${score.message}`;
  });
}

function renderDiagnosticAvailability(
  scoring: SerializedRealtimeScoring,
  metric: "cost" | "latency"
): string {
  const diagnostic = scoring.diagnostics[metric];
  return diagnostic.available ? "available" : `unavailable (${diagnostic.reason})`;
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
}
