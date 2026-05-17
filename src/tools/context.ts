import { z } from "zod";
import { ResolveServiceDatesOutputSchema } from "../domain/dateResolver";
import { DateTimeStringSchema } from "../domain/schema";

export const ToolActorSchema = z.enum(["agent", "user", "system", "policy"]);

export const ToolIdentityStatusSchema = z.enum([
  "confirmed",
  "uncertain",
  "unknown"
]);

export const PendingIdentityCandidateSchema = z.object({
  customer_id: z.string().min(1),
  name: z.string().min(1),
  phone_last4: z.string().min(1),
  identity_confidence: z.literal("confirmed"),
  lookup_user_turn_id: z.string().min(1),
  lookup_at: DateTimeStringSchema.optional()
}).strict();

export const ToolExecutionContextSchema = z.object({
  run_id: z.string().min(1),
  session_id: z.string().min(1),
  actor: ToolActorSchema,
  current_user_turn_id: z.string().min(1),
  last_user_message: z.string(),
  identity_status: ToolIdentityStatusSchema,
  resolved_customer_id: z.string().min(1).optional(),
  last_user_turn_at: DateTimeStringSchema.optional(),
  current_time: DateTimeStringSchema.optional(),
  reference_time: DateTimeStringSchema.optional(),
  trusted_date_resolutions: z.array(ResolveServiceDatesOutputSchema).optional(),
  pending_identity_candidate: PendingIdentityCandidateSchema.optional()
}).strict();

export type ToolActor = z.infer<typeof ToolActorSchema>;
export type ToolIdentityStatus = z.infer<typeof ToolIdentityStatusSchema>;
export type PendingIdentityCandidate = z.infer<
  typeof PendingIdentityCandidateSchema
>;
export type ToolExecutionContext = z.infer<typeof ToolExecutionContextSchema>;

export const TOOL_EXECUTION_CONTEXT_KEYS = [
  "run_id",
  "session_id",
  "actor",
  "current_user_turn_id",
  "last_user_message",
  "identity_status",
  "resolved_customer_id",
  "last_user_turn_at",
  "current_time",
  "reference_time",
  "trusted_date_resolutions",
  "pending_identity_candidate"
] as const satisfies readonly (keyof ToolExecutionContext)[];

export type ToolExecutionContextKey =
  (typeof TOOL_EXECUTION_CONTEXT_KEYS)[number];

export function validateToolExecutionContext(
  value: unknown
): ToolExecutionContext {
  return ToolExecutionContextSchema.parse(value);
}
