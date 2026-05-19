import type { RewardBasis } from "./rewardBasis";

export const PRIMARY_REWARDS = [
  "task_success",
  "final_state",
  "safety",
  "confirmation_boundary",
  "communication",
  "evidence"
] as const;

export type PrimaryReward = (typeof PRIMARY_REWARDS)[number];

export const DIAGNOSTIC_METRICS = [
  "tool_path_similarity",
  "tool_argument_validity",
  "perception",
  "turn_taking",
  "latency",
  "conversation_quality",
  "cost"
] as const;

export type DiagnosticMetric = (typeof DIAGNOSTIC_METRICS)[number];

export type AggregationRawScore = {
  category: string;
  failure_type?: string;
  message: string;
  passed: boolean;
  score_id: string;
};

export type PrimaryRewardResult = {
  passed: boolean;
  raw_score_ids: string[];
  score: number;
};

export type DiagnosticMetricResult =
  | {
      available: false;
      reason: string;
    }
  | {
      available: true;
      passed: boolean;
      raw_score_ids: string[];
      reward_relevant: boolean;
      score: number;
    };

export type AggregationFailure = {
  key: PrimaryReward | DiagnosticMetric;
  kind: "primary_reward" | "diagnostic";
  raw_score_ids: string[];
  score: number;
};

export type RewardAggregation = {
  diagnostic_failures: AggregationFailure[];
  diagnostics: Record<DiagnosticMetric, DiagnosticMetricResult>;
  primary_rewards: Record<PrimaryReward, PrimaryRewardResult>;
  reward_basis: RewardBasis[];
  reward_failures: AggregationFailure[];
  reward_passed: boolean;
  reward_score: number;
  selected_diagnostics: DiagnosticMetric[];
  selected_primary_rewards: PrimaryReward[];
};

export type RawScoreLike = {
  category: string;
  failure_type?: string;
  message: string;
  passed: boolean;
  score_id?: string;
};
