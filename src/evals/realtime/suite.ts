import type { RealtimeRunnerStatus } from "../../realtime/runner/types";
import {
  REALTIME_CRAWL_CONTRACT_CASE_IDS,
  REALTIME_WALK_ROBUSTNESS_CASE_IDS
} from "../cases/suites";
import type { RealtimeReportPaths } from "./reporting";
import type { RealtimeCrawlScoring } from "./scorerTypes";

export type RealtimeCaseRunSummary = RealtimeReportPaths & {
  audit_event_count: number;
  case_id: string;
  env_file_status: string;
  input_mode: "audio" | "text";
  model: string;
  platform_trace_group_id?: string;
  platform_tracing_enabled: boolean;
  reason?: string;
  reward_basis: string[];
  diagnostic_failures: number;
  reward_failures: number;
  score_failures: number;
  scoring_status: RealtimeCrawlScoring["status"];
  stage: string;
  status: RealtimeRunnerStatus;
  tool_call_count: number;
  trace_event_count: number;
  transcript_fragment_count: number;
  transport: string;
};

export function resolveRealtimeCaseIds(options: {
  caseId?: string;
  inputText?: string;
  stage: string;
}): string[] {
  if (options.inputText) return [options.caseId ?? "ad_hoc_text"];
  if (options.caseId) return [options.caseId];
  if (options.stage === "crawl") return [...REALTIME_CRAWL_CONTRACT_CASE_IDS];
  if (options.stage === "walk") return [...REALTIME_WALK_ROBUSTNESS_CASE_IDS];

  throw new Error(
    `No default realtime ${options.stage} suite is defined yet. Pass --case.`
  );
}

export function shouldFailRealtimeEval(
  summaries: RealtimeCaseRunSummary[]
): boolean {
  return summaries.some((summary) =>
    summary.status === "failed" ||
    summary.status === "timed_out" ||
    (summary.status === "completed" && summary.scoring_status === "failed")
  );
}

export function summarizeRealtimeSuite(options: {
  caseIds: string[];
  inputText?: string;
  results: RealtimeCaseRunSummary[];
  stage: string;
}): Record<string, unknown> {
  const isSuite = !options.inputText && options.caseIds.length > 1;
  return {
    mode: isSuite ? "suite" : "single",
    stage: options.stage,
    case_count: options.results.length,
    completed: countByStatus(options.results, "completed"),
    skipped: countByStatus(options.results, "skipped"),
    failed: countByStatus(options.results, "failed"),
    timed_out: countByStatus(options.results, "timed_out"),
    scoring_passed: countByScoringStatus(options.results, "passed"),
    scoring_failed: countByScoringStatus(options.results, "failed"),
    scoring_skipped: countByScoringStatus(options.results, "skipped"),
    score_failures: options.results.reduce(
      (total, result) => total + result.score_failures,
      0
    ),
    reward_failures: options.results.reduce(
      (total, result) => total + result.reward_failures,
      0
    ),
    diagnostic_failures: options.results.reduce(
      (total, result) => total + result.diagnostic_failures,
      0
    ),
    results: options.results
  };
}

function countByStatus(
  results: RealtimeCaseRunSummary[],
  status: RealtimeRunnerStatus
): number {
  return results.filter((result) => result.status === status).length;
}

function countByScoringStatus(
  results: RealtimeCaseRunSummary[],
  status: RealtimeCrawlScoring["status"]
): number {
  return results.filter((result) => result.scoring_status === status).length;
}
