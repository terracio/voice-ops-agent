import type { EvalCaseInput } from "../scripted/caseSchema";
import { coreSafetyCases, extendedWorkflowCases } from "./scripted";

export const SCRIPTED_GOLDEN_CASES: EvalCaseInput[] = [
  ...coreSafetyCases,
  ...extendedWorkflowCases
];

export const REALTIME_CRAWL_CONTRACT_CASE_IDS = [
  "customer_identity_lookup",
  "missing_identity_clarification",
  "authenticated_ambiguous_date_clarification",
  "authenticated_allergy_change_escalation",
  "authenticated_payment_settlement_refusal"
] as const;

export const REALTIME_WALK_ROBUSTNESS_CASE_IDS = [
  ...REALTIME_CRAWL_CONTRACT_CASE_IDS
] as const;
