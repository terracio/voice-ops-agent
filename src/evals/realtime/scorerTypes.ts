import type { RewardAggregation } from "../shared/rewardAggregationTypes";

export type RealtimeCrawlScoreCategory =
  | "audit"
  | "confirmation"
  | "conversation"
  | "perception"
  | "policy"
  | "run_health"
  | "state"
  | "tool_arguments"
  | "tool_selection"
  | "turn_taking";

export type RealtimeCrawlFailureType =
  | "audio_synthesis_failed"
  | "confirmation_boundary_failed"
  | "conversation_expectation_failed"
  | "final_state_mismatch"
  | "missing_audit_evidence"
  | "missing_openai_api_key"
  | "missing_policy"
  | "missing_required_tool"
  | "perception_transcript_missing"
  | "forbidden_tool_called"
  | "realtime_timeout"
  | "realtime_transport_failed"
  | "tool_call_failed"
  | "turn_output_missing";

export type RealtimeCrawlScore = {
  category: RealtimeCrawlScoreCategory;
  failure_type?: RealtimeCrawlFailureType;
  message: string;
  passed: boolean;
};

export type RealtimeCrawlDiagnostic = {
  category: RealtimeCrawlScoreCategory;
  failure_type: RealtimeCrawlFailureType;
  message: string;
};

export type RealtimeCrawlScoring = {
  diagnostics: RealtimeCrawlDiagnostic[];
  reward_evaluation?: RewardAggregation;
  score_failures: number;
  scores: RealtimeCrawlScore[];
  status: "failed" | "passed" | "skipped";
};
