import { z } from "zod";
import { createWriteBlockedAuditEvent } from "../audit";
import * as db from "./db";
import type { CustomerState } from "./db";
import type { ResolveServiceDatesOutput } from "./dateResolver";
import {
  evaluateMealPlanPolicies,
  type MealPlanPolicyEvaluation,
  type MedicalRiskSignal
} from "./policies/mealplan.policy";
import {
  DateTimeStringSchema,
  PolicyResultSchema,
  type ChangeOperation,
  type ChangeSet,
  type Confirmation,
  type Customer,
  type PolicyIdValue,
  type ToolResult
} from "./schema";

export const CustomizationPreviewDeltaSchema = z.object({
  operation_index: z.number().int().nonnegative(),
  field: z.enum(["spice_level", "dislikes", "protein_preferences"]),
  before: z.unknown(),
  after: z.unknown()
});

export const PreviewOperationSchema = z.object({
  operation_index: z.number().int().nonnegative(),
  type: z.string().min(1),
  description: z.string().min(1),
  affected_dates: z.array(z.string().min(1)).optional(),
  before: z.unknown().optional(),
  after: z.unknown().optional()
});

export const ChangeSetPreviewSchema = z.object({
  change_set_id: z.string().min(1),
  customer_id: z.string().min(1),
  previewed_at: DateTimeStringSchema,
  expires_at: DateTimeStringSchema,
  operations: z.array(PreviewOperationSchema).min(1),
  customization_deltas: z.array(CustomizationPreviewDeltaSchema),
  policy_results: z.array(PolicyResultSchema)
});

export type CustomizationPreviewDelta = z.infer<
  typeof CustomizationPreviewDeltaSchema
>;
export type ChangeSetPreview = z.infer<typeof ChangeSetPreviewSchema>;
export type LifecycleMetadata = {
  run_id: string;
  date_resolution?: ResolveServiceDatesOutput;
  medical_risk_signals: MedicalRiskSignal[];
};

const lifecycleMetadataByChangeSetId = new Map<string, LifecycleMetadata>();

export function buildChangeSetPreview(
  changeSet: ChangeSet,
  state: CustomerState,
  previewedAt: string
): ChangeSetPreview {
  const customization_deltas = changeSet.operations.flatMap(
    (operation, operation_index) =>
      operation.type === "update_customization"
        ? [customizationDelta(operation, operation_index, state)]
        : []
  );

  return ChangeSetPreviewSchema.parse({
    change_set_id: changeSet.change_set_id,
    customer_id: changeSet.customer_id,
    previewed_at: previewedAt,
    expires_at: changeSet.expires_at,
    operations: changeSet.operations.map((operation, operation_index) =>
      previewOperation(operation, operation_index, state)
    ),
    customization_deltas,
    policy_results: changeSet.policy_results
  });
}

function previewOperation(
  operation: ChangeOperation,
  operation_index: number,
  state: CustomerState
) {
  if (operation.type === "pause_dates") {
    return {
      operation_index,
      type: operation.type,
      description: `Pause service dates: ${operation.dates.join(", ")}`,
      affected_dates: operation.dates
    };
  }

  if (operation.type === "resume_dates") {
    return {
      operation_index,
      type: operation.type,
      description: `Resume service dates: ${operation.dates.join(", ")}`,
      affected_dates: operation.dates
    };
  }

  if (operation.type === "create_payment_followup") {
    return {
      operation_index,
      type: operation.type,
      description: `Create payment follow-up for ${operation.reason}`
    };
  }

  const delta = customizationDelta(operation, operation_index, state);

  return {
    operation_index,
    type: operation.type,
    description: `Update ${operation.field}`,
    before: delta.before,
    after: delta.after
  };
}

function customizationDelta(
  operation: Extract<ChangeOperation, { type: "update_customization" }>,
  operation_index: number,
  state: CustomerState
): CustomizationPreviewDelta {
  return CustomizationPreviewDeltaSchema.parse({
    operation_index,
    field: operation.field,
    before: state.customer.customizations[operation.field],
    after: operation.next_value
  });
}

export function rememberChangeSetMetadata(
  changeSetId: string,
  metadata: LifecycleMetadata
): void {
  lifecycleMetadataByChangeSetId.set(changeSetId, metadata);
}

export function metadataFor(
  changeSetId: string,
  fallbackRunId = "run_unknown"
): LifecycleMetadata {
  return lifecycleMetadataByChangeSetId.get(changeSetId) ?? {
    run_id: fallbackRunId,
    medical_risk_signals: []
  };
}

export function evaluateChangeSetPolicies(
  changeSet: ChangeSet,
  state: CustomerState,
  input: {
    stage: "preview" | "commit";
    now: string;
    confirmation?: Confirmation;
    proposed_customer?: Customer;
    date_resolution?: ResolveServiceDatesOutput;
    medical_risk_signals: MedicalRiskSignal[];
    preview: { shown: boolean; customization_deltas: CustomizationPreviewDelta[] };
  }
): MealPlanPolicyEvaluation {
  return evaluateMealPlanPolicies({
    stage: input.stage,
    now: input.now,
    customer: state.customer,
    proposedCustomer: input.proposed_customer,
    serviceDates: state.service_dates,
    changeSet,
    confirmation: input.confirmation,
    identity: {
      status: state.customer.identity_confidence,
      matched_customer_count: 1
    },
    dateResolution: {
      ambiguous: input.date_resolution?.ambiguous ??
        hasDateChangingOperation(changeSet.operations),
      reason: input.date_resolution?.clarification_question ??
        missingDateResolutionReason(changeSet.operations)
    },
    medicalRiskSignals: input.medical_risk_signals,
    preview: input.preview
  });
}

function hasDateChangingOperation(operations: ChangeOperation[]): boolean {
  return operations.some(
    (operation) =>
      operation.type === "pause_dates" || operation.type === "resume_dates"
  );
}

function missingDateResolutionReason(
  operations: ChangeOperation[]
): string | undefined {
  return hasDateChangingOperation(operations)
    ? "Date-changing operations require server-generated date resolution evidence."
    : undefined;
}

export function applyChangeOperations(
  state: CustomerState,
  operations: ChangeOperation[]
): CustomerState {
  const next = structuredClone(state);

  for (const operation of operations) {
    if (operation.type === "pause_dates" || operation.type === "resume_dates") {
      const status = operation.type === "pause_dates" ? "paused" : "active";
      next.service_dates = next.service_dates.map((serviceDate) =>
        operation.dates.includes(serviceDate.service_date)
          ? { ...serviceDate, status }
          : serviceDate
      );
    } else if (operation.type === "update_customization") {
      next.customer.customizations[operation.field] =
        structuredClone(operation.next_value) as never;
    }
  }

  return next;
}

export function confirmationIssue(
  changeSet: ChangeSet,
  confirmation: Confirmation | undefined,
  confirmationId: string,
  metadata: LifecycleMetadata
): string | undefined {
  if (!confirmation || changeSet.confirmation_id !== confirmationId) {
    return "Commit requires the server-captured confirmation for this ChangeSet.";
  }

  if (
    confirmation.confirmation_id !== confirmationId ||
    confirmation.change_set_id !== changeSet.change_set_id ||
    confirmation.customer_id !== changeSet.customer_id ||
    confirmation.run_id !== metadata.run_id ||
    confirmation.captured_by !== "server" ||
    confirmation.confirmed_by !== "user" ||
    !changeSet.previewed_at ||
    confirmation.previewed_at !== changeSet.previewed_at ||
    Date.parse(confirmation.confirmed_at) <= Date.parse(changeSet.previewed_at)
  ) {
    return "Confirmation does not match the previewed server ChangeSet.";
  }

  return undefined;
}

export function withCustomizationPreviousValues(
  operations: ChangeOperation[],
  customer: Customer
): ChangeOperation[] {
  return operations.map((operation) => {
    if (operation.type !== "update_customization") {
      return operation;
    }

    return {
      ...operation,
      previous_value: structuredClone(customer.customizations[operation.field])
    } as ChangeOperation;
  });
}

export function blockedChangeSet(
  changeSet: ChangeSet,
  run_id: string,
  policy_ids: PolicyIdValue[],
  message: string,
  evaluation?: MealPlanPolicyEvaluation
): ToolResult<ChangeSet> {
  const audit = db.appendAuditEvent(
    createWriteBlockedAuditEvent({
      run_id,
      actor: "policy",
      event_type: "write_blocked",
      customer_id: changeSet.customer_id,
      tool_name: "commit_change_set",
      change_set_id: changeSet.change_set_id,
      details: {
        policy_ids,
        policy_results: evaluation?.results,
        summary: message
      }
    })
  );

  return {
    ok: false,
    error: { code: "COMMIT_BLOCKED", message, policy_id: policy_ids[0] },
    audit_event_ids: [audit.event_id]
  };
}

export function uniquePolicyIds(policyIds: PolicyIdValue[]): PolicyIdValue[] {
  return [...new Set(policyIds)];
}

export function addMinutes(dateTime: string, minutes: number): string {
  return new Date(Date.parse(dateTime) + minutes * 60_000).toISOString();
}
