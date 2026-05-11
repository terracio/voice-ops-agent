import { z } from "zod";
import {
  createConfirmationCapturedAuditEvent,
  createPreviewAuditEvent,
  createProposedChangeAuditEvent,
  createWriteCommittedAuditEvent
} from "../audit";
import * as db from "./db";
import { ResolveServiceDatesOutputSchema } from "./dateResolver";
import {
  ChangeOperationSchema,
  ChangeSetSchema,
  ConfirmationSchema,
  DateTimeStringSchema,
  PolicyId,
  createToolResultSchema,
  type ChangeSet,
  type Confirmation,
  type ToolResult
} from "./schema";
import { ChangeSetPreviewSchema, addMinutes, applyChangeOperations, buildChangeSetPreview, blockedChangeSet, confirmationIssue, evaluateChangeSetPolicies, materializePaymentFollowups, metadataFor, rememberChangeSetMetadata, uniquePolicyIds, withCustomizationPreviousValues, type ChangeSetPreview } from "./changeSetPreview";

const DEFAULT_TTL_MINUTES = 15;

const MedicalRiskSignalSchema = z.object({
  kind: z.enum(["allergy", "medical"]),
  source: z.string().min(1)
});

export const CreateChangeSetInputSchema = z.object({
  run_id: z.string().min(1),
  customer_id: z.string().min(1),
  change_set_id: z.string().min(1).optional(),
  operations: z.array(ChangeOperationSchema).min(1),
  now: DateTimeStringSchema.optional(),
  expires_at: DateTimeStringSchema.optional(),
  ttl_minutes: z.number().int().positive().default(DEFAULT_TTL_MINUTES),
  date_resolution: ResolveServiceDatesOutputSchema.optional(),
  medical_risk_signals: z.array(MedicalRiskSignalSchema).default([])
});

export const PreviewChangeSetInputSchema = z.object({
  change_set_id: z.string().min(1),
  now: DateTimeStringSchema.optional()
});

export const CaptureConfirmationInputSchema = z.object({
  run_id: z.string().min(1),
  customer_id: z.string().min(1),
  change_set_id: z.string().min(1),
  confirmation_id: z.string().min(1).optional(),
  source_user_turn_id: z.string().min(1),
  transcript_excerpt: z.string().min(1),
  confirmation_source: z.enum([
    "scripted_user_turn", "debug_user_turn", "realtime_user_turn", "model_eval_user_turn"
  ]),
  confirmation_type: z.enum(["explicit_yes", "explicit_correction_then_yes"]),
  now: DateTimeStringSchema.optional()
});

export const CommitChangeSetInputSchema = z.object({ change_set_id: z.string().min(1), confirmation_id: z.string().min(1), now: DateTimeStringSchema.optional() });
export const ExpireChangeSetInputSchema = z.object({ change_set_id: z.string().min(1), now: DateTimeStringSchema.optional() });

export const CreateChangeSetResultSchema = createToolResultSchema(ChangeSetSchema), PreviewChangeSetResultSchema = createToolResultSchema(ChangeSetPreviewSchema), CaptureConfirmationResultSchema = createToolResultSchema(ConfirmationSchema), CommitChangeSetResultSchema = createToolResultSchema(ChangeSetSchema);

type CreateChangeSetInput = z.input<typeof CreateChangeSetInputSchema>;
type PreviewChangeSetInput = z.input<typeof PreviewChangeSetInputSchema>;
type CaptureConfirmationInput = z.input<typeof CaptureConfirmationInputSchema>;
type CommitChangeSetInput = z.input<typeof CommitChangeSetInputSchema>;
type ExpireChangeSetInput = z.input<typeof ExpireChangeSetInputSchema>;

let sequence = 0;

export function createChangeSet(input: CreateChangeSetInput): ToolResult<ChangeSet> {
  const parsed = CreateChangeSetInputSchema.parse(input);
  const now = parsed.now ?? new Date().toISOString();
  const state = db.getCustomerState(parsed.customer_id);

  if (!state) {
    return err("CUSTOMER_NOT_FOUND", `Unknown customer: ${parsed.customer_id}`);
  }

  const changeSetId = parsed.change_set_id ?? nextId("cs");
  if (db.getChangeSet(changeSetId)) {
    return err("CHANGE_SET_ALREADY_EXISTS", `ChangeSet already exists: ${changeSetId}`);
  }

  const operations = withCustomizationPreviousValues(parsed.operations, state.customer);
  const draft = ChangeSetSchema.parse({
    change_set_id: changeSetId,
    customer_id: parsed.customer_id,
    status: "draft",
    operations,
    expected_state_version: state.customer.state_version,
    created_at: now,
    expires_at: parsed.expires_at ?? addMinutes(now, parsed.ttl_minutes),
    policy_results: []
  });
  const evaluation = evaluateChangeSetPolicies(draft, state, {
    stage: "preview",
    now,
    date_resolution: parsed.date_resolution,
    medical_risk_signals: parsed.medical_risk_signals,
    preview: { shown: false, customization_deltas: [] }
  });
  const saved = db.saveChangeSet({ ...draft, policy_results: evaluation.results });
  rememberChangeSetMetadata(saved.change_set_id, {
    run_id: parsed.run_id,
    date_resolution: parsed.date_resolution,
    medical_risk_signals: parsed.medical_risk_signals
  });
  const audit = db.appendAuditEvent(
    createProposedChangeAuditEvent({
      run_id: parsed.run_id,
      actor: "agent",
      event_type: "proposed_change",
      customer_id: saved.customer_id,
      tool_name: "create_change_set",
      change_set_id: saved.change_set_id,
      details: { operation_count: saved.operations.length }
    })
  );

  return ok(saved, [audit.event_id]);
}

export function previewChangeSet(input: PreviewChangeSetInput): ToolResult<ChangeSetPreview> {
  const parsed = PreviewChangeSetInputSchema.parse(input);
  const now = parsed.now ?? new Date().toISOString();
  const changeSet = db.getChangeSet(parsed.change_set_id);

  if (!changeSet) {
    return err("CHANGE_SET_NOT_FOUND", `Unknown ChangeSet: ${parsed.change_set_id}`);
  }

  const state = db.getCustomerState(changeSet.customer_id);
  if (!state) {
    return err("CUSTOMER_NOT_FOUND", `Unknown customer: ${changeSet.customer_id}`);
  }

  const preview = buildChangeSetPreview(changeSet, state, now);
  const metadata = metadataFor(changeSet.change_set_id);
  const evaluation = evaluateChangeSetPolicies(changeSet, state, {
    stage: "preview",
    now,
    date_resolution: metadata.date_resolution,
    medical_risk_signals: metadata.medical_risk_signals,
    preview: { shown: true, customization_deltas: preview.customization_deltas }
  });
  const saved = db.saveChangeSet({
    ...changeSet,
    status: evaluation.allowed ? "previewed" : "blocked",
    previewed_at: now,
    policy_results: evaluation.results
  });
  const finalPreview = buildChangeSetPreview(saved, state, now);
  const audit = db.appendAuditEvent(
    createPreviewAuditEvent({
      run_id: metadata.run_id,
      actor: "system",
      event_type: "preview",
      customer_id: saved.customer_id,
      tool_name: "preview_change_set",
      change_set_id: saved.change_set_id,
      details: {
        operation_count: saved.operations.length,
        delta_previewed: finalPreview.customization_deltas.length > 0
      }
    })
  );

  return ok(finalPreview, [audit.event_id]);
}

export function captureServerConfirmation(input: CaptureConfirmationInput): ToolResult<Confirmation> {
  const parsed = CaptureConfirmationInputSchema.parse(input);
  const now = parsed.now ?? new Date().toISOString();
  const changeSet = db.getChangeSet(parsed.change_set_id);

  if (!changeSet?.previewed_at || changeSet.status !== "previewed") {
    return err("PREVIEW_REQUIRED", "Confirmation can only be captured after preview.");
  }

  if (changeSet.customer_id !== parsed.customer_id) {
    return err("CONFIRMATION_MISMATCH", "Confirmation customer does not match ChangeSet.");
  }

  const confirmation = ConfirmationSchema.parse({
    confirmation_id: parsed.confirmation_id ?? nextId("conf"),
    run_id: parsed.run_id,
    customer_id: parsed.customer_id,
    change_set_id: parsed.change_set_id,
    source_user_turn_id: parsed.source_user_turn_id,
    captured_by: "server",
    confirmed_by: "user",
    previewed_at: changeSet.previewed_at,
    confirmed_at: now,
    transcript_excerpt: parsed.transcript_excerpt,
    confirmation_source: parsed.confirmation_source,
    confirmation_type: parsed.confirmation_type
  });
  const saved = db.saveConfirmation(confirmation);

  db.saveChangeSet({
    ...changeSet,
    status: "confirmed",
    confirmed_at: saved.confirmed_at,
    confirmation_id: saved.confirmation_id
  });

  const audit = db.appendAuditEvent(
    createConfirmationCapturedAuditEvent({
      run_id: parsed.run_id,
      actor: "system",
      event_type: "confirmation_captured",
      customer_id: parsed.customer_id,
      tool_name: "capture_confirmation",
      change_set_id: parsed.change_set_id,
      details: {
        confirmation_id: saved.confirmation_id,
        source_user_turn_id: saved.source_user_turn_id,
        captured_by: "server",
        confirmed_by: "user",
        transcript_excerpt: saved.transcript_excerpt,
        confirmation_type: saved.confirmation_type
      }
    })
  );

  return ok(saved, [audit.event_id]);
}

export function commitChangeSet(input: CommitChangeSetInput): ToolResult<ChangeSet> {
  const parsed = CommitChangeSetInputSchema.parse(input);
  const now = parsed.now ?? new Date().toISOString();
  const changeSet = db.getChangeSet(parsed.change_set_id);
  const confirmation = db.getConfirmation(parsed.confirmation_id);
  const metadata = metadataFor(parsed.change_set_id, confirmation?.run_id);

  if (!changeSet) {
    return err("CHANGE_SET_NOT_FOUND", `Unknown ChangeSet: ${parsed.change_set_id}`);
  }

  if (changeSet.status === "committed") {
    const issue = confirmationIssue(changeSet, confirmation, parsed.confirmation_id, metadata);
    return issue
      ? blockedChangeSet(changeSet, metadata.run_id, [PolicyId.MISSING_CONFIRMATION], issue)
      : ok(changeSet, []);
  }

  const state = db.getCustomerState(changeSet.customer_id);
  if (!state) {
    return err("CUSTOMER_NOT_FOUND", `Unknown customer: ${changeSet.customer_id}`);
  }

  const proposedState = applyChangeOperations(state, changeSet.operations);
  const preview = changeSet.previewed_at
    ? buildChangeSetPreview(changeSet, state, changeSet.previewed_at)
    : undefined;
  const evaluation = evaluateChangeSetPolicies(changeSet, state, {
    stage: "commit",
    now,
    confirmation,
    proposed_customer: proposedState.customer,
    date_resolution: metadata.date_resolution,
    medical_risk_signals: metadata.medical_risk_signals,
    preview: {
      shown: Boolean(preview),
      customization_deltas: preview?.customization_deltas ?? []
    }
  });
  const issue = confirmationIssue(changeSet, confirmation, parsed.confirmation_id, metadata);
  const policyIds = uniquePolicyIds([
    ...evaluation.blocking_policy_ids,
    ...(issue ? [PolicyId.MISSING_CONFIRMATION] : [])
  ]);

  if (!evaluation.allowed || issue) {
    const expired = policyIds.includes(PolicyId.EXPIRED_CHANGESET);
    db.saveChangeSet({
      ...changeSet,
      status: expired ? "expired" : "blocked",
      policy_results: evaluation.results
    });
    return blockedChangeSet(
      changeSet,
      metadata.run_id,
      policyIds,
      issue ?? "Commit blocked by policy validation.",
      evaluation
    );
  }

  proposedState.customer.state_version = state.customer.state_version + 1;
  db.updateCustomerState(changeSet.customer_id, proposedState);
  const sideEffectIds = materializePaymentFollowups(changeSet, metadata.run_id, now);
  const committed = db.saveChangeSet({
    ...changeSet,
    status: "committed",
    confirmation_id: parsed.confirmation_id,
    confirmed_at: confirmation?.confirmed_at,
    committed_at: now,
    policy_results: evaluation.results
  });
  const audit = db.appendAuditEvent(
    createWriteCommittedAuditEvent({
      run_id: metadata.run_id,
      actor: "system",
      event_type: "write_committed",
      customer_id: committed.customer_id,
      tool_name: "commit_change_set",
      change_set_id: committed.change_set_id,
      details: {
        operation_count: committed.operations.length,
        committed_state_version: proposedState.customer.state_version
      }
    })
  );

  return ok(committed, [...sideEffectIds, audit.event_id]);
}

export function expireChangeSet(input: ExpireChangeSetInput): ToolResult<ChangeSet> {
  const parsed = ExpireChangeSetInputSchema.parse(input);
  const now = parsed.now ?? new Date().toISOString();
  const changeSet = db.getChangeSet(parsed.change_set_id);

  if (!changeSet) {
    return err("CHANGE_SET_NOT_FOUND", `Unknown ChangeSet: ${parsed.change_set_id}`);
  }

  if (changeSet.status === "committed" || Date.parse(now) <= Date.parse(changeSet.expires_at)) {
    return ok(changeSet, []);
  }

  return ok(db.saveChangeSet({ ...changeSet, status: "expired" }), []);
}

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${String(sequence).padStart(4, "0")}`;
}

function ok<T>(data: T, audit_event_ids: string[]): ToolResult<T> {
  return { ok: true, data, audit_event_ids };
}

function err<T>(code: string, message: string, audit_event_ids: string[] = []): ToolResult<T> {
  return { ok: false, error: { code, message }, audit_event_ids };
}
