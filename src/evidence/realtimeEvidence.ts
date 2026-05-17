import { z } from "zod";
import {
  AuditEventSchema,
  ChangeOperationSchema,
  ConfirmationSchema,
  DateTimeStringSchema,
  PolicyIdSchema,
  PolicyResultSchema,
  ToolErrorSchema,
  ToolRiskSchema
} from "../domain/schema";
import { RealtimeCostTelemetrySchema } from "../realtime/config/pricing";

export const REALTIME_EVIDENCE_SCHEMA_VERSION = "realtime_evidence.v1";

export const RealtimeEvidenceCallIdSchema = z
  .string()
  .regex(/^rtc_[A-Za-z0-9_-]{6,}$/);

export const EvidenceSourceRefSchema = z.object({
  audit_event_id: z.string().min(1).optional(),
  change_set_id: z.string().min(1).optional(),
  confirmation_id: z.string().min(1).optional(),
  customer_id: z.string().min(1).optional(),
  policy_id: PolicyIdSchema.optional(),
  tool_call_id: z.string().min(1).optional(),
  turn_id: z.string().min(1).optional()
}).strict();

const EvidenceBaseSchema = z.object({
  created_at: DateTimeStringSchema,
  evidence_id: z.string().min(1),
  source: EvidenceSourceRefSchema.default({})
}).strict();

export const TranscriptEvidenceItemSchema = EvidenceBaseSchema.extend({
  actor: z.enum(["user", "assistant", "system"]),
  is_operational_source: z.literal(false),
  text: z.string(),
  transcript_kind: z.enum([
    "realtime_transcript",
    "out_of_band_transcript",
    "debug_transcript"
  ]),
  turn_id: z.string().min(1)
}).strict();

export const RealtimeEventEvidenceItemSchema = EvidenceBaseSchema.extend({
  event_type: z.string().min(1),
  label: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]).default("info")
}).strict();

export const ToolEvidenceItemSchema = EvidenceBaseSchema.extend({
  audit_event_ids: z.array(z.string().min(1)).default([]),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  result_summary: z.string().min(1).optional(),
  risk: ToolRiskSchema,
  status: z.enum(["started", "ok", "blocked", "error"]),
  tool_call_id: z.string().min(1),
  tool_name: z.string().min(1),
  tool_error: ToolErrorSchema.optional()
}).superRefine((item, ctx) => {
  if ((item.status === "blocked" || item.status === "error") && !item.tool_error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Blocked/error tool evidence requires tool_error.",
      path: ["tool_error"]
    });
  }
  if (item.source.tool_call_id && item.source.tool_call_id !== item.tool_call_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tool evidence source must match tool_call_id.",
      path: ["source", "tool_call_id"]
    });
  }
}).strict();

export const PolicyEvidenceItemSchema = EvidenceBaseSchema.extend({
  policy_id: PolicyIdSchema,
  result: PolicyResultSchema,
  stage: z.enum(["read", "preview", "commit", "side_effect", "tool"])
}).superRefine((item, ctx) => {
  if (item.policy_id !== item.result.policy_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Policy evidence policy_id must match result.policy_id.",
      path: ["result", "policy_id"]
    });
  }
}).strict();

export const AuditEvidenceItemSchema = EvidenceBaseSchema.extend({
  audit_event: AuditEventSchema
}).superRefine((item, ctx) => {
  if (item.audit_event.event_id !== item.source.audit_event_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Audit evidence source must reference audit_event.event_id.",
      path: ["source", "audit_event_id"]
    });
  }
}).strict();

const CapturedConfirmationEvidenceItemSchema = EvidenceBaseSchema.extend({
  confirmation: ConfirmationSchema,
  status: z.literal("captured")
}).strict();

const UncapturedConfirmationEvidenceItemSchema = EvidenceBaseSchema.extend({
  change_set_id: z.string().min(1).optional(),
  customer_id: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  status: z.enum(["rejected", "missing"])
}).strict();

export const ConfirmationEvidenceItemSchema = z.discriminatedUnion("status", [
  CapturedConfirmationEvidenceItemSchema,
  UncapturedConfirmationEvidenceItemSchema
]).superRefine((item, ctx) => {
  if (item.status === "captured") {
    if (
      item.source.confirmation_id &&
      item.source.confirmation_id !== item.confirmation.confirmation_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmation evidence source must match confirmation_id.",
        path: ["source", "confirmation_id"]
      });
    }
    if (
      item.source.change_set_id &&
      item.source.change_set_id !== item.confirmation.change_set_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmation evidence source must match change_set_id.",
        path: ["source", "change_set_id"]
      });
    }
  }
  if (
    item.status !== "captured" &&
    item.source.change_set_id &&
    item.change_set_id &&
    item.source.change_set_id !== item.change_set_id
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmation evidence source must match change_set_id.",
      path: ["source", "change_set_id"]
    });
  }
});

export const ChangeSetEvidenceStatusSchema = z.enum([
  "draft",
  "previewed",
  "confirmed",
  "committed",
  "blocked",
  "expired",
  "failed"
]);

export const ChangeSetEvidenceItemSchema = EvidenceBaseSchema.extend({
  blocking_policy_ids: z.array(PolicyIdSchema).default([]),
  change_set_id: z.string().min(1),
  confirmation_id: z.string().min(1).optional(),
  customer_id: z.string().min(1),
  expected_state_version: z.number().int().nonnegative().optional(),
  operations: z.array(ChangeOperationSchema).default([]),
  policy_results: z.array(PolicyResultSchema).default([]),
  status: ChangeSetEvidenceStatusSchema
}).superRefine((item, ctx) => {
  if (
    item.source.change_set_id &&
    item.source.change_set_id !== item.change_set_id
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ChangeSet evidence source must match change_set_id.",
      path: ["source", "change_set_id"]
    });
  }
  if (item.status === "committed" && !item.confirmation_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Committed ChangeSet evidence requires confirmation_id.",
      path: ["confirmation_id"]
    });
  }
}).strict();

export const ChangeSetDiffEvidenceItemSchema = EvidenceBaseSchema.extend({
  after: z.unknown().optional(),
  before: z.unknown().optional(),
  can_describe_as_written: z.boolean(),
  change_set_id: z.string().min(1),
  customer_id: z.string().min(1),
  diff_kind: z.enum(["service_date", "customization", "payment_followup"]),
  field: z.string().min(1),
  operation: ChangeOperationSchema,
  status: z.enum(["proposed", "blocked", "committed", "expired", "failed"])
}).superRefine((diff, ctx) => {
  const canDescribeAsWritten = diff.status === "committed";
  if (diff.can_describe_as_written !== canDescribeAsWritten) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only committed diffs may be described as written.",
      path: ["can_describe_as_written"]
    });
  }
  if (
    diff.source.change_set_id &&
    diff.source.change_set_id !== diff.change_set_id
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Diff evidence source must match change_set_id.",
      path: ["source", "change_set_id"]
    });
  }
}).strict();

export const EvidenceLimitationSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["info", "warning"])
}).strict();

export const RealtimeEvidenceSnapshotSchema = z.object({
  audit_events: z.array(AuditEvidenceItemSchema).default([]),
  call_id: RealtimeEvidenceCallIdSchema,
  change_sets: z.array(ChangeSetEvidenceItemSchema).default([]),
  confirmations: z.array(ConfirmationEvidenceItemSchema).default([]),
  cost_telemetry: RealtimeCostTelemetrySchema.optional(),
  diffs: z.array(ChangeSetDiffEvidenceItemSchema).default([]),
  generated_at: DateTimeStringSchema,
  limitations: z.array(EvidenceLimitationSchema).default([]),
  policies: z.array(PolicyEvidenceItemSchema).default([]),
  realtime_events: z.array(RealtimeEventEvidenceItemSchema).default([]),
  run_id: z.string().min(1),
  schema_version: z.literal(REALTIME_EVIDENCE_SCHEMA_VERSION),
  status: z.enum(["active", "ended", "error"]),
  tools: z.array(ToolEvidenceItemSchema).default([]),
  transcript: z.array(TranscriptEvidenceItemSchema).default([])
}).superRefine((snapshot, ctx) => {
  const committedChangeSetIds = new Set(
    snapshot.change_sets
      .filter((changeSet) => changeSet.status === "committed")
      .map((changeSet) => changeSet.change_set_id)
  );

  snapshot.diffs.forEach((diff, index) => {
    if (
      diff.can_describe_as_written &&
      !committedChangeSetIds.has(diff.change_set_id)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Written diff requires committed ChangeSet evidence.",
        path: ["diffs", index, "change_set_id"]
      });
    }
  });
}).strict();

export type EvidenceSourceRef = z.infer<typeof EvidenceSourceRefSchema>;
export type TranscriptEvidenceItem = z.infer<
  typeof TranscriptEvidenceItemSchema
>;
export type RealtimeEventEvidenceItem = z.infer<
  typeof RealtimeEventEvidenceItemSchema
>;
export type ToolEvidenceItem = z.infer<typeof ToolEvidenceItemSchema>;
export type PolicyEvidenceItem = z.infer<typeof PolicyEvidenceItemSchema>;
export type AuditEvidenceItem = z.infer<typeof AuditEvidenceItemSchema>;
export type ConfirmationEvidenceItem = z.infer<
  typeof ConfirmationEvidenceItemSchema
>;
export type ChangeSetEvidenceItem = z.infer<
  typeof ChangeSetEvidenceItemSchema
>;
export type ChangeSetDiffEvidenceItem = z.infer<
  typeof ChangeSetDiffEvidenceItemSchema
>;
export type EvidenceLimitation = z.infer<typeof EvidenceLimitationSchema>;
export type RealtimeCostTelemetry = z.infer<typeof RealtimeCostTelemetrySchema>;
export type RealtimeEvidenceSnapshot = z.infer<
  typeof RealtimeEvidenceSnapshotSchema
>;
