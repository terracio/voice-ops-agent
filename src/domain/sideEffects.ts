import { z } from "zod";
import { createSideEffectAuditEvent, createWriteBlockedAuditEvent } from "../audit";
import * as db from "./db";
import type { CustomerState } from "./db";
import { evaluateMealPlanPolicies } from "./policies/mealplan.policy";
import {
  PolicyId,
  type ChangeOperation,
  type ChangeSet,
  type PaymentFollowup,
  type PolicyIdValue
} from "./schema";

const SideEffectTypeSchema = z.enum(["payment_followup", "kitchen_delta"]);
const BlockedSideEffectAttemptSchema = z.object({
  side_effect_type: SideEffectTypeSchema,
  idempotency_key: z.string().min(1),
  reason: z.string().min(1),
  policy_ids: z.array(z.string().min(1)).min(1)
});

export const SideEffectMaterializationResultSchema = z.object({
  audit_event_ids: z.array(z.string().min(1)),
  created_side_effect_ids: z.array(z.string().min(1)),
  blocked_attempts: z.array(BlockedSideEffectAttemptSchema)
});

export type SideEffectMaterializationResult = z.infer<typeof SideEffectMaterializationResultSchema>;

type SideEffectInput = { changeSet: ChangeSet; run_id: string; now: string };
type SideEffectType = z.infer<typeof SideEffectTypeSchema>;
type MealOperation = { operation: ChangeOperation; index: number };
type PaymentFollowupReason = PaymentFollowup["reason"];

const PAYMENT_FOLLOWUP_REASONS: PaymentFollowupReason[] = [
  "failed_payment",
  "past_due",
  "unknown_status"
];

export function materializeCommittedSideEffects(
  input: SideEffectInput
): SideEffectMaterializationResult {
  return combineResults([
    materializeCommittedPaymentFollowups(input),
    materializeCommittedKitchenDeltas(input)
  ]);
}

export function materializeCommittedPaymentFollowups(
  input: SideEffectInput
): SideEffectMaterializationResult {
  let result = emptyResult();

  input.changeSet.operations.forEach((operation, index) => {
    if (operation.type !== "create_payment_followup") return;
    const idempotency_key = paymentFollowupIdempotencyKey(input.changeSet, index);

    if (input.changeSet.status !== "committed") {
      result = combineResults([result, blockSideEffect({
        ...input,
        side_effect_type: "payment_followup",
        idempotency_key,
        policy_ids: [PolicyId.MISSING_CONFIRMATION],
        reason: "Payment follow-ups require a committed ChangeSet."
      })]);
      return;
    }

    if (!isPaymentFollowupReason(operation.reason)) {
      result = combineResults([result, blockSideEffect({
        ...input,
        side_effect_type: "payment_followup",
        idempotency_key,
        policy_ids: [PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN],
        reason: "Payment follow-up reason is not eligible."
      })]);
      return;
    }

    if (findPaymentFollowup(input.changeSet.customer_id, idempotency_key)) return;

    const followup = db.savePaymentFollowup({
      followup_id: `pf_${input.changeSet.change_set_id}_${index}`,
      customer_id: input.changeSet.customer_id,
      idempotency_key,
      reason: operation.reason,
      status: "open",
      created_at: input.now,
      source_change_set_id: input.changeSet.change_set_id
    });
    const audit = db.appendAuditEvent(
      createSideEffectAuditEvent({
        run_id: input.run_id,
        actor: "system",
        event_type: "side_effect_created",
        customer_id: input.changeSet.customer_id,
        tool_name: "materialize_payment_followup",
        change_set_id: input.changeSet.change_set_id,
        details: {
          side_effect_type: "payment_followup",
          side_effect_id: followup.followup_id,
          idempotency_key,
          operation_index: index,
          reason: followup.reason
        }
      })
    );

    result = combineResults([result, {
      audit_event_ids: [audit.event_id],
      created_side_effect_ids: [followup.followup_id],
      blocked_attempts: []
    }]);
  });

  return result;
}

export function materializeCommittedKitchenDeltas(
  input: SideEffectInput
): SideEffectMaterializationResult {
  const operations = mealAffectingOperations(input.changeSet.operations);
  if (operations.length === 0) return emptyResult();

  const idempotency_key = kitchenDeltaIdempotencyKey(input.changeSet, operations);
  const policyIds = blockedKitchenPolicyIds(input.changeSet, input.now);
  if (policyIds.length > 0) {
    return blockSideEffect({
      ...input,
      side_effect_type: "kitchen_delta",
      idempotency_key,
      policy_ids: policyIds,
      reason: "Kitchen deltas are internal-only after commit."
    });
  }

  if (findKitchenDelta(input.changeSet.customer_id, idempotency_key)) {
    return emptyResult();
  }

  const state = db.getCustomerState(input.changeSet.customer_id);
  if (!state) {
    return blockSideEffect({
      ...input,
      side_effect_type: "kitchen_delta",
      idempotency_key,
      policy_ids: [PolicyId.KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN],
      reason: "Kitchen delta creation requires committed customer state."
    });
  }

  const affected_dates = affectedKitchenDates(operations, state);
  if (affected_dates.length === 0) return emptyResult();

  const delta = db.saveKitchenExportDelta({
    delta_id: `kd_${input.changeSet.change_set_id}_kitchen_delta`,
    customer_id: input.changeSet.customer_id,
    change_set_id: input.changeSet.change_set_id,
    idempotency_key,
    affected_dates,
    summary: kitchenDeltaSummary(operations, affected_dates),
    created_at: input.now
  });
  const audit = db.appendAuditEvent(
    createSideEffectAuditEvent({
      run_id: input.run_id,
      actor: "system",
      event_type: "side_effect_created",
      customer_id: input.changeSet.customer_id,
      tool_name: "materialize_kitchen_delta",
      change_set_id: input.changeSet.change_set_id,
      details: {
        side_effect_type: "kitchen_delta",
        side_effect_id: delta.delta_id,
        idempotency_key,
        affected_dates,
        operation_identities: operations.map(operationIdentity)
      }
    })
  );

  return SideEffectMaterializationResultSchema.parse({
    audit_event_ids: [audit.event_id],
    created_side_effect_ids: [delta.delta_id],
    blocked_attempts: []
  });
}

export function isMealAffectingOperation(operation: ChangeOperation): boolean {
  return (
    operation.type === "pause_dates" ||
    operation.type === "resume_dates" ||
    operation.type === "update_customization"
  );
}

function mealAffectingOperations(operations: ChangeOperation[]): MealOperation[] {
  return operations.flatMap((operation, index) =>
    isMealAffectingOperation(operation) ? [{ operation, index }] : []
  );
}

function affectedKitchenDates(
  operations: MealOperation[],
  state: CustomerState
): string[] {
  const serviceDates = new Map(
    state.service_dates.map((serviceDate) => [serviceDate.service_date, serviceDate])
  );
  const affectedDates = new Set<string>();

  operations.forEach(({ operation }) => {
    if (operation.type !== "pause_dates" && operation.type !== "resume_dates") return;
    operation.dates.forEach((date) => {
      if (serviceDates.has(date)) affectedDates.add(date);
    });
  });

  if (operations.some(({ operation }) => operation.type === "update_customization")) {
    state.service_dates.forEach((serviceDate) => {
      if (serviceDate.status === "active" && !serviceDate.kitchen_locked) {
        affectedDates.add(serviceDate.service_date);
      }
    });
  }

  return [...affectedDates].sort();
}

function blockedKitchenPolicyIds(changeSet: ChangeSet, now: string): PolicyIdValue[] {
  const evaluation = evaluateMealPlanPolicies({
    stage: "side_effect",
    now,
    sideEffect: {
      type: "kitchen_delta",
      internal: true,
      sourceChangeSet: {
        change_set_id: changeSet.change_set_id,
        customer_id: changeSet.customer_id,
        status: changeSet.status
      }
    }
  });

  return evaluation.allowed ? [] : evaluation.blocking_policy_ids;
}

function blockSideEffect(input: SideEffectInput & {
  side_effect_type: SideEffectType;
  idempotency_key: string;
  policy_ids: PolicyIdValue[];
  reason: string;
}): SideEffectMaterializationResult {
  const audit = db.appendAuditEvent(
    createWriteBlockedAuditEvent({
      run_id: input.run_id,
      actor: "policy",
      event_type: "write_blocked",
      customer_id: input.changeSet.customer_id,
      tool_name: toolName(input.side_effect_type),
      change_set_id: input.changeSet.change_set_id,
      details: {
        policy_ids: input.policy_ids,
        summary: input.reason,
        side_effect_type: input.side_effect_type,
        idempotency_key: input.idempotency_key
      }
    })
  );

  return SideEffectMaterializationResultSchema.parse({
    audit_event_ids: [audit.event_id],
    created_side_effect_ids: [],
    blocked_attempts: [{
      side_effect_type: input.side_effect_type,
      idempotency_key: input.idempotency_key,
      reason: input.reason,
      policy_ids: input.policy_ids
    }]
  });
}

function paymentFollowupIdempotencyKey(
  changeSet: ChangeSet,
  operationIndex: number
): string {
  return `${changeSet.change_set_id}:create_payment_followup:${operationIndex}`;
}

function kitchenDeltaIdempotencyKey(
  changeSet: ChangeSet,
  operations: MealOperation[]
): string {
  return `${changeSet.change_set_id}:kitchen_delta:${operations
    .map(operationIdentity)
    .join("+")}`;
}

function operationIdentity({ operation, index }: MealOperation): string {
  if (operation.type === "pause_dates" || operation.type === "resume_dates") {
    return `${index}:${operation.type}:${operation.dates.join(",")}`;
  }
  if (operation.type === "update_customization") {
    return `${index}:${operation.type}:${operation.field}`;
  }
  return `${index}:${operation.type}`;
}

function kitchenDeltaSummary(operations: MealOperation[], affected_dates: string[]): string {
  return `Kitchen delta for ${operations.length} meal operation(s) affecting ${affected_dates.join(", ")}.`;
}

function findPaymentFollowup(customerId: string, idempotencyKey: string) {
  return db.listPaymentFollowups(customerId).find((followup) =>
    followup.idempotency_key === idempotencyKey
  );
}

function findKitchenDelta(customerId: string, idempotencyKey: string) {
  return db.listKitchenExportDeltas(customerId).find((delta) =>
    delta.idempotency_key === idempotencyKey
  );
}

function isPaymentFollowupReason(value: unknown): value is PaymentFollowupReason {
  return PAYMENT_FOLLOWUP_REASONS.includes(value as PaymentFollowupReason);
}

function toolName(sideEffectType: SideEffectType): string {
  return sideEffectType === "kitchen_delta"
    ? "materialize_kitchen_delta"
    : "materialize_payment_followup";
}

function combineResults(
  results: SideEffectMaterializationResult[]
): SideEffectMaterializationResult {
  return SideEffectMaterializationResultSchema.parse({
    audit_event_ids: results.flatMap((result) => result.audit_event_ids),
    created_side_effect_ids: results.flatMap((result) => result.created_side_effect_ids),
    blocked_attempts: results.flatMap((result) => result.blocked_attempts)
  });
}

function emptyResult(): SideEffectMaterializationResult {
  return { audit_event_ids: [], created_side_effect_ids: [], blocked_attempts: [] };
}
