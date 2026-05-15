import type { RealtimeRunnerResult } from "../../realtime/runner/types";
import { PolicyIdSchema, type PolicyIdValue } from "../../domain/schema";
import type {
  RealtimeCrawlFailureType,
  RealtimeCrawlScore,
  RealtimeCrawlScoreCategory
} from "./scorerTypes";

export function observedPolicyIds(result: RealtimeRunnerResult): Set<PolicyIdValue> {
  const values = [
    ...result.tool_calls.flatMap((call) => [
      call.policy_id,
      ...policyIdsFrom(call.input),
      ...policyIdsFrom(call.output)
    ]),
    ...result.audit_events.flatMap((event) => policyIdsFrom(event.details))
  ];
  return new Set(values.filter((value): value is PolicyIdValue => Boolean(value)));
}

export function classifyFailedRun(reason?: string): RealtimeCrawlFailureType {
  if (reason?.includes("speech synthesis")) return "audio_synthesis_failed";
  return "realtime_transport_failed";
}

export function pass(category: RealtimeCrawlScoreCategory, message: string): RealtimeCrawlScore {
  return { category, message, passed: true };
}

export function fail(
  category: RealtimeCrawlScoreCategory,
  failure_type: RealtimeCrawlFailureType,
  message: string
): RealtimeCrawlScore {
  return { category, failure_type, message, passed: false };
}

export function hasField(value: unknown, field: string): boolean {
  return isRecord(value) && field in value;
}

function policyIdsFrom(value: unknown): PolicyIdValue[] {
  if (typeof value === "string") {
    const parsed = PolicyIdSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  }
  if (Array.isArray(value)) return value.flatMap(policyIdsFrom);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const nested = policyIdsFrom(entry);
    if ((key === "policy_id" || key === "policy_ids") && typeof entry === "string") {
      const parsed = PolicyIdSchema.safeParse(entry);
      return parsed.success ? [parsed.data, ...nested] : nested;
    }
    return nested;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
