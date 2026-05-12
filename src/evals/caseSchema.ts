import { z } from "zod";
import {
  DateTimeStringSchema,
  KitchenExportDeltaSchema,
  PaymentFollowupSchema
} from "../domain/schema";
import { SEED_SCENARIO_IDS } from "../domain/seed";

export const EvalModeSchema = z.enum(["scripted", "model"]);

export const EvalEvidenceKindSchema = z.enum([
  "scripted_operational_safety",
  "model_behavior"
]);

export const EvalCaseStatusSchema = z.enum([
  "passed",
  "failed",
  "blocked",
  "errored",
  "skipped"
]);

export const EvalSeedIdSchema = z.enum(SEED_SCENARIO_IDS);

export const TranscriptEntrySchema = z.object({
  turn_id: z.string().min(1),
  actor: z.enum(["user", "agent", "system"]),
  text: z.string().min(1),
  created_at: DateTimeStringSchema.optional()
});

export const EvalCaseSchema = z.object({
  case_id: z.string().min(1),
  title: z.string().min(1),
  mode: EvalModeSchema,
  seed_id: EvalSeedIdSchema,
  transcript: z.array(TranscriptEntrySchema).default([]),
  tags: z.array(z.string().min(1)).default([])
});

export const ToolCallRecordSchema = z.object({
  tool_call_id: z.string().min(1),
  tool_name: z.string().min(1),
  risk: z.enum(["read", "preview", "write", "side_effect", "escalation"]),
  status: z.enum(["ok", "blocked", "error"]),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).optional(),
  audit_event_ids: z.array(z.string().min(1)).default([])
});

export const EvalConfirmationRecordSchema = z
  .object({
    confirmation_id: z.string().min(1),
    change_set_id: z.string().min(1),
    customer_id: z.string().min(1),
    source_user_turn_id: z.string().min(1),
    captured_by: z.literal("server"),
    confirmed_by: z.literal("user"),
    previewed_at: DateTimeStringSchema,
    confirmed_at: DateTimeStringSchema,
    confirmation_type: z.enum([
      "explicit_yes",
      "explicit_correction_then_yes"
    ])
  })
  .superRefine((confirmation, ctx) => {
    if (
      Date.parse(confirmation.confirmed_at) <=
      Date.parse(confirmation.previewed_at)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmation must be captured after preview.",
        path: ["confirmed_at"]
      });
    }
  });

export const SideEffectSnapshotSchema = z.object({
  payment_followups: z.array(PaymentFollowupSchema).default([]),
  kitchen_deltas: z.array(KitchenExportDeltaSchema).default([])
});

export const ScoreResultSchema = z.object({
  score_id: z.string().min(1),
  category: z.enum([
    "final_db_state",
    "required_tool_usage",
    "forbidden_tool_usage",
    "hard_policy",
    "confirmation_boundary",
    "audit_completeness",
    "conversation_quality",
    "operational_safety"
  ]),
  passed: z.boolean(),
  message: z.string().min(1)
});

export const EvalDiagnosticSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  code: z.string().min(1),
  message: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()).optional()
});

export const EvalCaseResultSchema = z.object({
  case_id: z.string().min(1),
  title: z.string().min(1),
  mode: EvalModeSchema,
  seed_id: EvalSeedIdSchema,
  evidence_kind: EvalEvidenceKindSchema,
  status: EvalCaseStatusSchema,
  transcript: z.array(TranscriptEntrySchema),
  tool_calls: z.array(ToolCallRecordSchema),
  audit_ids: z.array(z.string().min(1)),
  confirmations: z.array(EvalConfirmationRecordSchema),
  side_effects: SideEffectSnapshotSchema,
  scores: z.array(ScoreResultSchema),
  diagnostics: z.array(EvalDiagnosticSchema),
  started_at: DateTimeStringSchema,
  finished_at: DateTimeStringSchema,
  duration_ms: z.number().nonnegative()
});

export const EvalRunMetadataSchema = z.object({
  report_schema_version: z.literal(1),
  run_id: z.string().min(1),
  mode: EvalModeSchema,
  started_at: DateTimeStringSchema,
  finished_at: DateTimeStringSchema,
  duration_ms: z.number().nonnegative()
});

export const EvalRunSummarySchema = z.object({
  cases_total: z.number().int().nonnegative(),
  cases_passed: z.number().int().nonnegative(),
  cases_failed: z.number().int().nonnegative(),
  cases_blocked: z.number().int().nonnegative(),
  cases_errored: z.number().int().nonnegative(),
  cases_skipped: z.number().int().nonnegative(),
  score_failures: z.number().int().nonnegative(),
  hard_policy_violations: z.number().int().nonnegative(),
  evidence: z.object({
    scripted_operational_safety: z.number().int().nonnegative(),
    model_behavior: z.number().int().nonnegative()
  })
});

export const EvalRunReportSchema = z.object({
  metadata: EvalRunMetadataSchema,
  summary: EvalRunSummarySchema,
  results: z.array(EvalCaseResultSchema)
});

export type EvalMode = z.infer<typeof EvalModeSchema>;
export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type EvalCaseResult = z.infer<typeof EvalCaseResultSchema>;
export type EvalRunReport = z.infer<typeof EvalRunReportSchema>;
