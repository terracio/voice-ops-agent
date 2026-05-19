import { z } from "zod";

export const RewardBasisSchema = z.enum([
  "TASK",
  "FINAL_STATE",
  "SAFETY",
  "CONFIRMATION",
  "COMMUNICATION",
  "EVIDENCE",
  "ACTION",
  "AUDIO_ROBUSTNESS"
]);

export type RewardBasis = z.infer<typeof RewardBasisSchema>;

export const RewardBasisListSchema = z.array(RewardBasisSchema).min(1);

export const SCRIPTED_DEFAULT_REWARD_BASIS: RewardBasis[] = [
  "FINAL_STATE",
  "SAFETY",
  "CONFIRMATION",
  "EVIDENCE"
];

export const REALTIME_CRAWL_DEFAULT_REWARD_BASIS: RewardBasis[] = [
  "SAFETY",
  "COMMUNICATION",
  "EVIDENCE"
];

export const REALTIME_CRAWL_WRITE_CAPABLE_DEFAULT_REWARD_BASIS: RewardBasis[] = [
  "TASK",
  "SAFETY",
  "CONFIRMATION",
  "COMMUNICATION",
  "EVIDENCE"
];

export const REALTIME_WRITE_TASK_DEFAULT_REWARD_BASIS: RewardBasis[] = [
  "TASK",
  "FINAL_STATE",
  "SAFETY",
  "CONFIRMATION",
  "COMMUNICATION",
  "EVIDENCE"
];

export const REALTIME_WALK_DEGRADED_DEFAULT_REWARD_BASIS: RewardBasis[] = [
  "SAFETY",
  "COMMUNICATION",
  "EVIDENCE"
];

export function defaultRealtimeRewardBasis(input: {
  audio?: { walk_profile?: unknown };
  expected: {
    expected_final_state: { changed: boolean };
    response?: { should_request_confirmation?: boolean };
  };
  stage: string;
}): RewardBasis[] {
  if (input.stage === "walk" || input.audio?.walk_profile) {
    return copyRewardBasis(REALTIME_WALK_DEGRADED_DEFAULT_REWARD_BASIS);
  }
  if (input.expected.expected_final_state.changed) {
    return copyRewardBasis(REALTIME_WRITE_TASK_DEFAULT_REWARD_BASIS);
  }
  if (input.stage === "crawl" && input.expected.response?.should_request_confirmation) {
    return copyRewardBasis(
      REALTIME_CRAWL_WRITE_CAPABLE_DEFAULT_REWARD_BASIS
    );
  }
  return copyRewardBasis(REALTIME_CRAWL_DEFAULT_REWARD_BASIS);
}

export function defaultScriptedRewardBasis(): RewardBasis[] {
  return copyRewardBasis(SCRIPTED_DEFAULT_REWARD_BASIS);
}

function copyRewardBasis(rewardBasis: RewardBasis[]): RewardBasis[] {
  return [...rewardBasis];
}
