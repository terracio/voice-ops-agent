import { z } from "zod";
import {
  AuditEventSchema,
  ChangeSetSchema,
  ConfirmationSchema,
  CustomerSchema,
  DateTimeStringSchema,
  KitchenExportDeltaSchema,
  PaymentFollowupSchema,
  PlanSchema,
  PolicyIdSchema,
  ServiceDateSchema
} from "../../domain/schema";
import { SEED_SCENARIO_IDS } from "../../domain/seed";
import {
  defaultScriptedRewardBasis,
  RewardBasisListSchema
} from "../shared/rewardBasis";

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

export const EvalScriptContextPatchSchema = z
  .object({
    identity_status: z.enum(["confirmed", "uncertain", "unknown"]).optional(),
    resolved_customer_id: z.string().min(1).optional(),
    reference_time: DateTimeStringSchema.optional(),
    current_time: DateTimeStringSchema.optional()
  })
  .strict();

export const EvalScriptExpectationSchema = z
  .object({
    ok: z.boolean().optional(),
    error_code: z.string().min(1).optional(),
    policy_id: PolicyIdSchema.optional()
  })
  .strict();

const ScriptMessageStepSchema = z.object({
  type: z.enum(["user", "correction"]),
  turn_id: z.string().min(1).optional(),
  text: z.string().min(1),
  context: EvalScriptContextPatchSchema.optional()
}).strict();

const ScriptAssistantStepSchema = z.object({
  type: z.enum(["assistant", "debug"]),
  turn_id: z.string().min(1).optional(),
  text: z.string().min(1)
}).strict();

const ScriptToolCallStepSchema = z.object({
  type: z.literal("tool_call"),
  tool_call_id: z.string().min(1).optional(),
  tool_name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
  expect: EvalScriptExpectationSchema.optional()
}).strict();

const ScriptConfirmationStepSchema = z.object({
  type: z.literal("confirmation"),
  turn_id: z.string().min(1).optional(),
  text: z.string().min(1),
  change_set_id: z.string().min(1),
  context: EvalScriptContextPatchSchema.optional(),
  expect: EvalScriptExpectationSchema.optional()
}).strict();

const ScriptSetupStepSchema = z.object({
  type: z.literal("setup"),
  action: z.enum(["set_context", "make_customer_state_stale"]),
  context: EvalScriptContextPatchSchema.optional(),
  customer_id: z.string().min(1).optional(),
  state_version_increment: z.number().int().positive().default(1)
}).strict();

export const EvalScriptStepSchema = z.discriminatedUnion("type", [
  ScriptMessageStepSchema,
  ScriptAssistantStepSchema,
  ScriptToolCallStepSchema,
  ScriptConfirmationStepSchema,
  ScriptSetupStepSchema
]);

export const ExpectedServiceDateStateSchema = ServiceDateSchema.pick({
  service_date: true,
  status: true
});

export const ExpectedPaymentFollowupSchema = PaymentFollowupSchema.pick({
  customer_id: true,
  reason: true,
  status: true,
  source_change_set_id: true
}).partial();

export const ExpectedKitchenDeltaSchema = KitchenExportDeltaSchema.pick({
  customer_id: true,
  change_set_id: true,
  affected_dates: true
}).partial();

export const ExpectedFinalStateSchema = z.object({
  customer: CustomerSchema.partial().optional(),
  plan: PlanSchema.partial().optional(),
  service_dates: z.array(ExpectedServiceDateStateSchema).default([]),
  payment_followups: z.array(ExpectedPaymentFollowupSchema).default([]),
  kitchen_deltas: z.array(ExpectedKitchenDeltaSchema).default([])
});

export const ConversationExpectationsSchema = z.object({
  must_ask_clarification: z.boolean().default(false),
  must_escalate: z.boolean().default(false),
  must_mention_limitations: z.array(z.string().min(1)).default([]),
  max_agent_words_before_confirmation: z.number().int().positive().optional()
});

export const DEFAULT_CONVERSATION_EXPECTATIONS = {
  must_ask_clarification: false,
  must_escalate: false,
  must_mention_limitations: [] as string[]
};

export const EvalScoringExpectationsSchema = z.object({
  required_tools: z.array(z.string().min(1)).default([]),
  forbidden_tools: z.array(z.string().min(1)).default([]),
  required_policy_ids: z.array(PolicyIdSchema).default([]),
  forbidden_policy_violations: z.array(PolicyIdSchema).default([]),
  required_audit_events: z
    .array(AuditEventSchema.shape.event_type)
    .default([]),
  expected_final_state: ExpectedFinalStateSchema.optional(),
  conversation_expectations: ConversationExpectationsSchema.default(
    DEFAULT_CONVERSATION_EXPECTATIONS
  )
});

export const DEFAULT_EVAL_SCORING_EXPECTATIONS = {
  required_tools: [] as string[],
  forbidden_tools: [] as string[],
  required_policy_ids: [] as z.infer<typeof PolicyIdSchema>[],
  forbidden_policy_violations: [] as z.infer<typeof PolicyIdSchema>[],
  required_audit_events: [] as z.infer<
    typeof AuditEventSchema.shape.event_type
  >[],
  conversation_expectations: DEFAULT_CONVERSATION_EXPECTATIONS
};

export const EvalCaseSchema = z.object({
  case_id: z.string().min(1),
  title: z.string().min(1),
  mode: EvalModeSchema,
  seed_id: EvalSeedIdSchema,
  reward_basis: RewardBasisListSchema.default(defaultScriptedRewardBasis),
  transcript: z.array(TranscriptEntrySchema).default([]),
  script: z.array(EvalScriptStepSchema).default([]),
  tags: z.array(z.string().min(1)).default([]),
  expected: EvalScoringExpectationsSchema.default(
    DEFAULT_EVAL_SCORING_EXPECTATIONS
  )
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
    ]),
    confirmation_intent: ConfirmationSchema.shape.confirmation_intent
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

export const FinalCustomerStateSnapshotSchema = z.object({
  customer_id: z.string().min(1),
  customer: CustomerSchema,
  plan: PlanSchema,
  service_dates: z.array(ServiceDateSchema)
});

export const EvalFinalStateSnapshotSchema = z.object({
  customer_states: z.array(FinalCustomerStateSnapshotSchema).default([]),
  change_sets: z.array(ChangeSetSchema).default([]),
  confirmations: z.array(ConfirmationSchema).default([]),
  customer: CustomerSchema.optional(),
  plan: PlanSchema.optional(),
  service_dates: z.array(ServiceDateSchema).default([]),
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
    "side_effect_idempotency",
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
  reward_basis: RewardBasisListSchema.default(defaultScriptedRewardBasis),
  evidence_kind: EvalEvidenceKindSchema,
  status: EvalCaseStatusSchema,
  transcript: z.array(TranscriptEntrySchema),
  tool_calls: z.array(ToolCallRecordSchema),
  audit_ids: z.array(z.string().min(1)),
  audit_events: z.array(AuditEventSchema).default([]),
  confirmations: z.array(EvalConfirmationRecordSchema),
  side_effects: SideEffectSnapshotSchema,
  final_state: EvalFinalStateSnapshotSchema.default({
    customer_states: [],
    change_sets: [],
    confirmations: [],
    service_dates: [],
    payment_followups: [],
    kitchen_deltas: []
  }),
  scores: z.array(ScoreResultSchema),
  diagnostics: z.array(EvalDiagnosticSchema),
  run_metadata: z
    .object({
      run_id: z.string().min(1),
      session_id: z.string().min(1),
      started_at: DateTimeStringSchema,
      finished_at: DateTimeStringSchema,
      duration_ms: z.number().nonnegative()
    })
    .optional(),
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
export type EvalCaseInput = z.input<typeof EvalCaseSchema>;
export type EvalCase = z.output<typeof EvalCaseSchema>;
export type EvalScriptStep = z.infer<typeof EvalScriptStepSchema>;
export type EvalScoringExpectations = z.infer<
  typeof EvalScoringExpectationsSchema
>;
export type EvalCaseResult = z.infer<typeof EvalCaseResultSchema>;
export type EvalRunReport = z.infer<typeof EvalRunReportSchema>;
