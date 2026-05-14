import {
  ChangeSetSchema,
  ConfirmationSchema,
  PolicyIdSchema,
  PolicyResultSchema,
  type AuditEvent,
  type ChangeOperation,
  type ChangeSet,
  type Confirmation,
  type PolicyResult,
  type ToolResult,
  type ToolRisk
} from "../domain/schema";
import type {
  AuditEvidenceItem,
  ChangeSetDiffEvidenceItem,
  ChangeSetEvidenceItem,
  ConfirmationEvidenceItem,
  PolicyEvidenceItem,
  RealtimeEventEvidenceItem,
  ToolEvidenceItem,
  TranscriptEvidenceItem
} from "./realtimeEvidence";

export type ToolEvidenceSeed = {
  createdAt: string;
  evidenceId: string;
  input: unknown;
  risk: ToolRisk;
  toolCallId: string;
  toolName: string;
};

export function timestamp(now?: () => Date): string {
  return (now ?? (() => new Date()))().toISOString();
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function realtimeEventEvidence(options: {
  createdAt: string;
  eventType: string;
  evidenceId: string;
  label: string;
  severity?: "info" | "warning" | "error";
}): RealtimeEventEvidenceItem {
  return {
    evidence_id: options.evidenceId,
    created_at: options.createdAt,
    event_type: options.eventType,
    label: options.label,
    severity: options.severity ?? "info",
    source: {}
  };
}

export function transcriptEvidence(options: {
  createdAt: string;
  event: Record<string, unknown>;
  eventType: string;
  evidenceId: string;
  turnId: string;
}): TranscriptEvidenceItem | undefined {
  const fragment = transcriptFragment(options.event, options.eventType);
  if (!fragment) return undefined;

  return {
    evidence_id: options.evidenceId,
    created_at: options.createdAt,
    turn_id: options.turnId,
    actor: fragment.actor,
    transcript_kind: "realtime_transcript",
    is_operational_source: false,
    text: fragment.text,
    source: { turn_id: options.turnId }
  };
}

export function startedToolEvidence(seed: ToolEvidenceSeed): ToolEvidenceItem {
  return {
    evidence_id: seed.evidenceId,
    created_at: seed.createdAt,
    tool_call_id: seed.toolCallId,
    tool_name: seed.toolName,
    risk: seed.risk,
    status: "started",
    audit_event_ids: [],
    input: seed.input,
    source: { tool_call_id: seed.toolCallId }
  };
}

export function applyToolResult(
  item: ToolEvidenceItem,
  result: ToolResult<unknown>
): void {
  item.status = toolStatus(result);
  item.output = result;
  item.audit_event_ids = result.audit_event_ids;
  item.result_summary = result.ok ? "Tool completed." : result.error.message;
  if (result.ok) {
    delete item.tool_error;
  } else {
    item.tool_error = result.error;
  }
}

export function auditEvidence(options: {
  createdAt: string;
  event: AuditEvent;
}): AuditEvidenceItem {
  const { event } = options;
  return {
    evidence_id: `audit_${event.event_id}`,
    created_at: options.createdAt,
    audit_event: event,
    source: {
      audit_event_id: event.event_id,
      change_set_id: event.change_set_id,
      customer_id: event.customer_id,
      policy_id: firstPolicyId(event)
    }
  };
}

export function changeSetEvidence(options: {
  changeSet: ChangeSet;
  createdAt: string;
}): ChangeSetEvidenceItem {
  const { changeSet } = options;
  return {
    evidence_id: `cs_${changeSet.change_set_id}`,
    created_at: options.createdAt,
    blocking_policy_ids: blockingPolicyIds(changeSet.policy_results),
    change_set_id: changeSet.change_set_id,
    confirmation_id: changeSet.confirmation_id,
    customer_id: changeSet.customer_id,
    expected_state_version: changeSet.expected_state_version,
    operations: changeSet.operations,
    policy_results: changeSet.policy_results,
    status: changeSet.status,
    source: {
      change_set_id: changeSet.change_set_id,
      confirmation_id: changeSet.confirmation_id,
      customer_id: changeSet.customer_id
    }
  };
}

export function confirmationEvidence(options: {
  confirmation: Confirmation;
  createdAt: string;
}): ConfirmationEvidenceItem {
  const { confirmation } = options;
  return {
    evidence_id: `conf_${confirmation.confirmation_id}`,
    created_at: options.createdAt,
    status: "captured",
    confirmation,
    source: {
      change_set_id: confirmation.change_set_id,
      confirmation_id: confirmation.confirmation_id,
      customer_id: confirmation.customer_id,
      turn_id: confirmation.source_user_turn_id
    }
  };
}

export function diffEvidenceItems(options: {
  changeSet: ChangeSet;
  createdAt: string;
}): ChangeSetDiffEvidenceItem[] {
  return options.changeSet.operations.map((operation, index) => {
    const key = `${options.changeSet.change_set_id}:${index}`;
    return {
      evidence_id: `diff_${key}`,
      created_at: options.createdAt,
      change_set_id: options.changeSet.change_set_id,
      customer_id: options.changeSet.customer_id,
      status: diffStatus(options.changeSet.status),
      diff_kind: diffKind(operation),
      field: diffField(operation),
      before: beforeValue(operation),
      after: afterValue(operation),
      can_describe_as_written: options.changeSet.status === "committed",
      operation,
      source: { change_set_id: options.changeSet.change_set_id }
    };
  });
}

export function policyEvidence(options: {
  createdAt: string;
  evidenceId: string;
  result: PolicyResult;
  stage: PolicyEvidenceItem["stage"];
  toolCallId?: string;
}): PolicyEvidenceItem {
  return {
    evidence_id: options.evidenceId,
    created_at: options.createdAt,
    policy_id: options.result.policy_id,
    result: options.result,
    stage: options.stage,
    source: {
      policy_id: options.result.policy_id,
      tool_call_id: options.toolCallId
    }
  };
}

export function parseResultChangeSet(result: ToolResult<unknown>) {
  return result.ok ? ChangeSetSchema.safeParse(result.data).data : undefined;
}

export function parseResultConfirmation(result: ToolResult<unknown>) {
  return result.ok ? ConfirmationSchema.safeParse(result.data).data : undefined;
}

export function failedPolicyResult(result: ToolResult<unknown>) {
  if (result.ok || !result.error.policy_id) return undefined;
  return {
    policy_id: result.error.policy_id,
    severity: "block" as const,
    passed: false,
    message: result.error.message
  };
}

export function policyResultsFromAudit(event: AuditEvent): PolicyResult[] {
  const parsed = PolicyResultSchema.array().safeParse(event.details.policy_results);
  if (parsed.success) return parsed.data;
  const policyIds = Array.isArray(event.details.policy_ids)
    ? event.details.policy_ids
    : [];
  return policyIds.flatMap((policyId) => {
    const parsedPolicyId = PolicyIdSchema.safeParse(policyId);
    return parsedPolicyId.success
      ? [{
        policy_id: parsedPolicyId.data,
        severity: "block" as const,
        passed: false,
        message: stringValue(event.details.summary) ?? "Policy blocked action."
      }]
      : [];
  });
}

export function stageForTool(toolName: string | undefined): PolicyEvidenceItem["stage"] {
  if (toolName === "commit_change_set") return "commit";
  if (toolName?.includes("change_set")) return "preview";
  return "tool";
}

function toolStatus(result: ToolResult<unknown>): ToolEvidenceItem["status"] {
  if (result.ok) return "ok";
  return result.error.policy_id ? "blocked" : "error";
}

function blockingPolicyIds(results: PolicyResult[]) {
  return results
    .filter((result) => !result.passed && result.severity !== "info")
    .map((result) => result.policy_id);
}

function firstPolicyId(event: AuditEvent) {
  return policyResultsFromAudit(event)[0]?.policy_id;
}

function transcriptFragment(
  event: Record<string, unknown>,
  eventType: string
): { actor: "assistant" | "user"; text: string } | undefined {
  if (isUserTranscriptEvent(eventType)) {
    const text = stringValue(event.transcript) ?? stringValue(event.delta);
    return text ? { actor: "user", text } : undefined;
  }
  if (
    eventType === "response.audio_transcript.delta" ||
    eventType === "response.output_audio_transcript.delta"
  ) {
    const text = stringValue(event.delta);
    return text ? { actor: "assistant", text } : undefined;
  }
  if (
    eventType === "response.audio_transcript.done" ||
    eventType === "response.output_audio_transcript.done"
  ) {
    const text = stringValue(event.transcript);
    return text ? { actor: "assistant", text } : undefined;
  }
  if (eventType.startsWith("response.output_text")) {
    const text = stringValue(event.delta) ?? stringValue(event.text);
    return text ? { actor: "assistant", text } : undefined;
  }
  return undefined;
}

function isUserTranscriptEvent(eventType: string): boolean {
  return [
    "conversation.item.input_audio_transcription.completed",
    "conversation.item.input_audio_transcription.done",
    "conversation.item.input_audio_transcription.delta",
    "input_audio_buffer.transcription.completed",
    "input_audio_buffer.transcription.done",
    "input_audio_buffer.transcription.delta",
    "input_audio_transcription.completed",
    "input_audio_transcription.done",
    "input_audio_transcription.delta"
  ].includes(eventType);
}

function diffStatus(status: ChangeSet["status"]): ChangeSetDiffEvidenceItem["status"] {
  if (status === "committed" || status === "blocked" || status === "expired") {
    return status;
  }
  return "proposed";
}

function diffKind(operation: ChangeOperation): ChangeSetDiffEvidenceItem["diff_kind"] {
  if (operation.type === "update_customization") return "customization";
  if (operation.type === "create_payment_followup") return "payment_followup";
  return "service_date";
}

function diffField(operation: ChangeOperation): string {
  if (operation.type === "update_customization") return operation.field;
  if (operation.type === "create_payment_followup") return "payment_followup";
  return "service_dates";
}

function beforeValue(operation: ChangeOperation): unknown {
  return "previous_value" in operation ? operation.previous_value : undefined;
}

function afterValue(operation: ChangeOperation): unknown {
  if (operation.type === "update_customization") return operation.next_value;
  if (operation.type === "create_payment_followup") return operation.reason;
  return operation.dates;
}
