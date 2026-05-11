import { z } from "zod";

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date in YYYY-MM-DD format");

export const DateTimeStringSchema = z.string().datetime({ offset: true });

export const DayOfWeekSchema = z.enum([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
]);

export const SpiceLevelSchema = z.enum([
  "mild",
  "normal",
  "spicy",
  "extra_spicy"
]);

export const PaymentStatusSchema = z.enum([
  "current",
  "failed",
  "past_due",
  "unknown"
]);

export const POLICY_IDS = [
  "P001_IDENTITY_UNCERTAIN",
  "P002_AMBIGUOUS_DATE",
  "P003_MISSING_PREVIEW",
  "P004_MISSING_CONFIRMATION",
  "P005_STALE_STATE_VERSION",
  "P006_EXPIRED_CHANGESET",
  "P007_ALLERGY_MUTATION_FORBIDDEN",
  "P008_MEDICAL_RISK_ESCALATION_REQUIRED",
  "P009_PAYMENT_SETTLEMENT_FORBIDDEN",
  "P010_KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN",
  "P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA"
] as const;

export const PolicyId = {
  IDENTITY_UNCERTAIN: POLICY_IDS[0],
  AMBIGUOUS_DATE: POLICY_IDS[1],
  MISSING_PREVIEW: POLICY_IDS[2],
  MISSING_CONFIRMATION: POLICY_IDS[3],
  STALE_STATE_VERSION: POLICY_IDS[4],
  EXPIRED_CHANGESET: POLICY_IDS[5],
  ALLERGY_MUTATION_FORBIDDEN: POLICY_IDS[6],
  MEDICAL_RISK_ESCALATION_REQUIRED: POLICY_IDS[7],
  PAYMENT_SETTLEMENT_FORBIDDEN: POLICY_IDS[8],
  KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN: POLICY_IDS[9],
  CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA: POLICY_IDS[10]
} as const;

export const PolicyIdSchema = z.enum(POLICY_IDS);

export const CustomerSchema = z.object({
  customer_id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1),
  timezone: z.string().default("Asia/Dubai"),
  identity_confidence: z.enum(["confirmed", "uncertain"]).default("confirmed"),
  state_version: z.number().int().nonnegative(),
  plan_id: z.string().min(1),
  allergies: z.array(z.string().min(1)),
  customizations: z.object({
    spice_level: SpiceLevelSchema,
    dislikes: z.array(z.string().min(1)),
    protein_preferences: z.array(z.string().min(1)).default([])
  }),
  payment_status: PaymentStatusSchema,
  payment_last_checked_at: DateTimeStringSchema.optional()
});

export const PlanSchema = z.object({
  plan_id: z.string().min(1),
  customer_id: z.string().min(1),
  plan_name: z.string().min(1),
  meals_per_week: z.number().int().positive(),
  delivery_days: z.array(DayOfWeekSchema),
  status: z.enum(["active", "paused", "cancelled"])
});

export const ServiceDateSchema = z.object({
  service_date: DateStringSchema,
  day_of_week: DayOfWeekSchema,
  status: z.enum(["active", "paused", "locked", "skipped"]),
  kitchen_cutoff_at: DateTimeStringSchema,
  kitchen_locked: z.boolean()
});

export const PaymentFollowupSchema = z.object({
  followup_id: z.string().min(1),
  customer_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  reason: z.enum(["failed_payment", "past_due", "unknown_status"]),
  status: z.enum(["open", "closed"]),
  created_at: DateTimeStringSchema,
  source_change_set_id: z.string().min(1).optional()
});

export const KitchenExportDeltaSchema = z.object({
  delta_id: z.string().min(1),
  customer_id: z.string().min(1),
  change_set_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  affected_dates: z.array(DateStringSchema),
  summary: z.string().min(1),
  created_at: DateTimeStringSchema
});

export const PauseDatesOperationSchema = z.object({
  type: z.literal("pause_dates"),
  dates: z.array(DateStringSchema).min(1),
  reason: z.string().min(1).optional()
});

export const ResumeDatesOperationSchema = z.object({
  type: z.literal("resume_dates"),
  dates: z.array(DateStringSchema).min(1)
});

export const UpdateSpiceLevelOperationSchema = z.object({
  type: z.literal("update_customization"),
  field: z.literal("spice_level"),
  previous_value: SpiceLevelSchema.optional(),
  next_value: SpiceLevelSchema
});

export const UpdateDislikesOperationSchema = z.object({
  type: z.literal("update_customization"),
  field: z.literal("dislikes"),
  previous_value: z.array(z.string().min(1)).optional(),
  next_value: z.array(z.string().min(1))
});

export const UpdateProteinPreferencesOperationSchema = z.object({
  type: z.literal("update_customization"),
  field: z.literal("protein_preferences"),
  previous_value: z.array(z.string().min(1)).optional(),
  next_value: z.array(z.string().min(1))
});

export const CreatePaymentFollowupOperationSchema = z.object({
  type: z.literal("create_payment_followup"),
  reason: z.enum(["failed_payment", "past_due", "unknown_status"])
});

export const ChangeOperationSchema = z.union([
  PauseDatesOperationSchema,
  ResumeDatesOperationSchema,
  UpdateSpiceLevelOperationSchema,
  UpdateDislikesOperationSchema,
  UpdateProteinPreferencesOperationSchema,
  CreatePaymentFollowupOperationSchema
]);

export const PolicyResultSchema = z.object({
  policy_id: PolicyIdSchema,
  severity: z.enum(["info", "warning", "block", "escalate"]),
  passed: z.boolean(),
  message: z.string().min(1)
});

export const ChangeSetSchema = z.object({
  change_set_id: z.string().min(1),
  customer_id: z.string().min(1),
  status: z.enum([
    "draft",
    "previewed",
    "confirmed",
    "committed",
    "blocked",
    "expired"
  ]),
  operations: z.array(ChangeOperationSchema).min(1),
  expected_state_version: z.number().int().nonnegative(),
  created_at: DateTimeStringSchema,
  previewed_at: DateTimeStringSchema.optional(),
  confirmed_at: DateTimeStringSchema.optional(),
  committed_at: DateTimeStringSchema.optional(),
  expires_at: DateTimeStringSchema,
  confirmation_id: z.string().min(1).optional(),
  policy_results: z.array(PolicyResultSchema).default([])
});

export const ConfirmationSchema = z.object({
  confirmation_id: z.string().min(1),
  run_id: z.string().min(1),
  customer_id: z.string().min(1),
  change_set_id: z.string().min(1),
  source_user_turn_id: z.string().min(1),
  captured_by: z.literal("server"),
  confirmed_by: z.literal("user"),
  previewed_at: DateTimeStringSchema,
  confirmed_at: DateTimeStringSchema,
  transcript_excerpt: z.string().min(1),
  confirmation_source: z.enum([
    "scripted_user_turn",
    "debug_user_turn",
    "realtime_user_turn",
    "model_eval_user_turn"
  ]),
  confirmation_type: z.enum([
    "explicit_yes",
    "explicit_correction_then_yes"
  ])
}).superRefine((confirmation, ctx) => {
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

export const AuditEventSchema = z.object({
  event_id: z.string().min(1),
  timestamp: DateTimeStringSchema,
  run_id: z.string().min(1),
  actor: z.enum(["agent", "user", "system", "policy"]),
  event_type: z.enum([
    "read",
    "proposed_change",
    "preview",
    "confirmation_captured",
    "write_committed",
    "write_blocked",
    "side_effect_created",
    "escalation_created",
    "policy_warning",
    "policy_block"
  ]),
  customer_id: z.string().min(1).optional(),
  tool_name: z.string().min(1).optional(),
  change_set_id: z.string().min(1).optional(),
  details: z.record(z.string(), z.unknown())
});

export const ToolRiskSchema = z.enum([
  "read",
  "preview",
  "write",
  "side_effect",
  "escalation"
]);

export const ToolErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  policy_id: PolicyIdSchema.optional()
});

export function createToolResultSchema<TData extends z.ZodType>(
  dataSchema: TData
) {
  return z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      data: dataSchema,
      audit_event_ids: z.array(z.string().min(1)),
      error: z.never().optional()
    }),
    z.object({
      ok: z.literal(false),
      error: ToolErrorSchema,
      audit_event_ids: z.array(z.string().min(1)),
      data: z.never().optional()
    })
  ]);
}

export const ScaffoldStatusSchema = z.object({
  project: z.literal("mealplan-voiceops"),
  ready: z.boolean()
});

export type DateString = z.infer<typeof DateStringSchema>;
export type DateTimeString = z.infer<typeof DateTimeStringSchema>;
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;
export type SpiceLevel = z.infer<typeof SpiceLevelSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type PolicyIdValue = z.infer<typeof PolicyIdSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type ServiceDate = z.infer<typeof ServiceDateSchema>;
export type PaymentFollowup = z.infer<typeof PaymentFollowupSchema>;
export type KitchenExportDelta = z.infer<typeof KitchenExportDeltaSchema>;
export type ChangeOperation = z.infer<typeof ChangeOperationSchema>;
export type PolicyResult = z.infer<typeof PolicyResultSchema>;
export type ChangeSet = z.infer<typeof ChangeSetSchema>;
export type Confirmation = z.infer<typeof ConfirmationSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type ToolRisk = z.infer<typeof ToolRiskSchema>;
export type ToolError = z.infer<typeof ToolErrorSchema>;
export type ToolResult<TData> =
  | { ok: true; data: TData; audit_event_ids: string[]; error?: never }
  | { ok: false; error: ToolError; audit_event_ids: string[]; data?: never };
export type ScaffoldStatus = z.infer<typeof ScaffoldStatusSchema>;

export function scaffoldStatus(): ScaffoldStatus {
  return ScaffoldStatusSchema.parse({
    project: "mealplan-voiceops",
    ready: true
  });
}
