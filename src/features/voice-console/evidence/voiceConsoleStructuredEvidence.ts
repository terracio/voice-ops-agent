export type EvidencePolicySeverity = "info" | "warning" | "block" | "escalate";

export type EvidencePolicyResult = {
  message: string;
  passed: boolean;
  policyId: string;
  severity: EvidencePolicySeverity;
};

export type EvidencePolicyItem = {
  at: string;
  id: string;
  policyId: string;
  result: EvidencePolicyResult;
  stage: string;
};

export type EvidenceChangeSetItem = {
  at: string;
  blockingPolicyIds: string[];
  changeSetId: string;
  confirmationId?: string;
  customerId: string;
  expectedStateVersion?: number;
  operations: unknown[];
  policyResults: EvidencePolicyResult[];
  status: string;
};

export type EvidenceChangeSetDiffItem = {
  after?: unknown;
  at: string;
  before?: unknown;
  changeSetId: string;
  customerId: string;
  diffKind: string;
  field: string;
  operation?: unknown;
  status: string;
};

export function toPolicyItem(value: unknown, index: number): EvidencePolicyItem {
  const item = isRecord(value) ? value : {};
  const result = toPolicyResult(item.result);
  return {
    at: displayTime(item.created_at),
    id: stringValue(item.evidence_id) ?? `policy-${index}`,
    policyId: stringValue(item.policy_id) ?? result.policyId,
    result,
    stage: stringValue(item.stage) ?? "tool"
  };
}

export function toChangeSetItem(
  value: unknown,
  index: number
): EvidenceChangeSetItem {
  const item = isRecord(value) ? value : {};
  return {
    at: displayTime(item.created_at),
    blockingPolicyIds: arrayValue(item.blocking_policy_ids).flatMap(stringArrayItem),
    changeSetId: stringValue(item.change_set_id) ?? `change-set-${index}`,
    confirmationId: stringValue(item.confirmation_id),
    customerId: stringValue(item.customer_id) ?? "unknown",
    expectedStateVersion: numberValue(item.expected_state_version),
    operations: arrayValue(item.operations),
    policyResults: arrayValue(item.policy_results).map(toPolicyResult),
    status: stringValue(item.status) ?? "unknown"
  };
}

export function toDiffItem(
  value: unknown,
  index: number
): EvidenceChangeSetDiffItem {
  const item = isRecord(value) ? value : {};
  return {
    after: item.after,
    at: displayTime(item.created_at),
    before: item.before,
    changeSetId: stringValue(item.change_set_id) ?? `change-set-${index}`,
    customerId: stringValue(item.customer_id) ?? "unknown",
    diffKind: stringValue(item.diff_kind) ?? "unknown",
    field: stringValue(item.field) ?? "unknown",
    operation: item.operation,
    status: stringValue(item.status) ?? "unknown"
  };
}

function toPolicyResult(value: unknown): EvidencePolicyResult {
  const item = isRecord(value) ? value : {};
  return {
    message: stringValue(item.message) ?? "Policy result unavailable.",
    passed: item.passed === true,
    policyId: stringValue(item.policy_id) ?? "unknown_policy",
    severity: policySeverity(item.severity)
  };
}

function policySeverity(value: unknown): EvidencePolicySeverity {
  return value === "warning" || value === "block" || value === "escalate"
    ? value
    : "info";
}

function displayTime(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return "--:--:--";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArrayItem(value: unknown): string[] {
  const item = stringValue(value);
  return item ? [item] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
