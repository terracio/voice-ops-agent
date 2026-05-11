import { z } from "zod";
import { ResolveServiceDatesOutputSchema } from "../domain/dateResolver";
import {
  DateTimeStringSchema,
  DayOfWeekSchema,
  DateStringSchema,
  PaymentStatusSchema,
  PolicyIdSchema,
  ServiceDateSchema,
  SpiceLevelSchema
} from "../domain/schema";

const SearchStringSchema = z.string().trim().min(1);

export const LookupCustomerInputSchema = z.object({
  customer_id: SearchStringSchema.optional(),
  name: SearchStringSchema.optional(),
  phone: SearchStringSchema.optional()
}).strict().superRefine((input, ctx) => {
  if (!input.customer_id && !input.name && !input.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide at least one lookup field.",
      path: ["customer_id"]
    });
  }
});

export const LookupCustomerCandidateSchema = z.object({
  customer_id: z.string().min(1),
  name: z.string().min(1),
  phone_last4: z.string().min(1),
  identity_confidence: z.enum(["confirmed", "uncertain"])
}).strict();

export const LookupCustomerOutputSchema = z.object({
  identity_status: z.enum(["confirmed", "uncertain"]),
  candidate_count: z.number().int().nonnegative(),
  candidates: z.array(LookupCustomerCandidateSchema),
  policy_ids: z.array(PolicyIdSchema),
  write_blocked: z.boolean(),
  clarification_question: z.string().min(1).optional()
}).strict();

export const AuthorizedCustomerInputSchema = z.object({
  customer_id: z.string().min(1).optional()
}).strict();

export const CustomerStateCustomerSchema = z.object({
  customer_id: z.string().min(1),
  name: z.string().min(1),
  timezone: z.string().min(1),
  identity_confidence: z.enum(["confirmed", "uncertain"]),
  state_version: z.number().int().nonnegative(),
  allergies: z.array(z.string().min(1)),
  customizations: z.object({
    spice_level: SpiceLevelSchema,
    dislikes: z.array(z.string().min(1)),
    protein_preferences: z.array(z.string().min(1))
  }).strict()
}).strict();

export const CustomerStatePlanSchema = z.object({
  plan_id: z.string().min(1),
  plan_name: z.string().min(1),
  meals_per_week: z.number().int().positive(),
  delivery_days: z.array(DayOfWeekSchema),
  status: z.enum(["active", "paused", "cancelled"])
}).strict();

export const CustomerStateOutputSchema = z.object({
  customer: CustomerStateCustomerSchema,
  plan: CustomerStatePlanSchema,
  service_dates: z.array(ServiceDateSchema)
}).strict();

export const ResolveServiceDatesToolInputSchema = z.object({
  phrase: z.string().trim().min(1),
  requested_days: z.array(DayOfWeekSchema).optional()
}).strict();

export const ResolveServiceDatesToolOutputSchema =
  ResolveServiceDatesOutputSchema.extend({
    policy_ids: z.array(PolicyIdSchema),
    write_blocked: z.boolean()
  }).strict();

export const PaymentStatusInputSchema = AuthorizedCustomerInputSchema;

export const PaymentFollowupReasonSchema = z.enum([
  "failed_payment",
  "past_due",
  "unknown_status"
]);

export const PaymentStatusOutputSchema = z.object({
  customer_id: z.string().min(1),
  payment_status: PaymentStatusSchema,
  payment_last_checked_at: DateTimeStringSchema.optional(),
  followup_recommended: z.boolean(),
  followup_reason: PaymentFollowupReasonSchema.optional(),
  payment_settlement_allowed: z.literal(false),
  forbidden_policy_ids: z.array(PolicyIdSchema)
}).strict();

export const ToolReferenceDateSchema = DateStringSchema;

export type LookupCustomerInput = z.infer<typeof LookupCustomerInputSchema>;
export type LookupCustomerOutput = z.infer<typeof LookupCustomerOutputSchema>;
export type AuthorizedCustomerInput = z.infer<typeof AuthorizedCustomerInputSchema>;
export type CustomerStateOutput = z.infer<typeof CustomerStateOutputSchema>;
export type ResolveServiceDatesToolInput = z.infer<
  typeof ResolveServiceDatesToolInputSchema
>;
export type ResolveServiceDatesToolOutput = z.infer<
  typeof ResolveServiceDatesToolOutputSchema
>;
export type PaymentStatusOutput = z.infer<typeof PaymentStatusOutputSchema>;
