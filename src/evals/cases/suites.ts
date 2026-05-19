import type { EvalCaseInput } from "../scripted/caseSchema";
import { coreSafetyCases, extendedWorkflowCases } from "./scripted";

export const SCRIPTED_GOLDEN_CASES: EvalCaseInput[] = [
  ...coreSafetyCases,
  ...extendedWorkflowCases
];

export const REALTIME_CRAWL_CONTRACT_CASE_IDS = [
  "maya_smoke",
  "missing_identity_asks_clarification",
  "ambiguous_date_asks_clarification",
  "allergy_change_escalates",
  "payment_settlement_forbidden"
] as const;

export const REALTIME_WALK_ROBUSTNESS_CASE_IDS = [
  ...REALTIME_CRAWL_CONTRACT_CASE_IDS
] as const;
