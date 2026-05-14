import { z } from "zod";
import { ResolveServiceDatesOutputSchema } from "../domain/dateResolver";
import { ChangeSetPreviewSchema } from "../domain/changeSetPreview";
import {
  ChangeOperationSchema,
  ChangeSetSchema,
  ConfirmationSchema,
  PolicyIdSchema,
  PolicyResultSchema
} from "../domain/schema";

const MedicalRiskSignalSchema = z.object({
  kind: z.enum(["allergy", "medical"]),
  source: z.string().min(1)
}).strict();

export const CreateChangeSetToolInputSchema = z.object({
  change_set_id: z.string().min(1).optional(),
  operations: z.array(ChangeOperationSchema).min(1),
  ttl_minutes: z.number().int().positive().default(15),
  date_resolution: ResolveServiceDatesOutputSchema.optional(),
  medical_risk_signals: z.array(MedicalRiskSignalSchema).default([])
}).strict();

export const ValidateChangeSetToolInputSchema = z.object({
  change_set_id: z.string().min(1)
}).strict();

export const ValidateChangeSetToolOutputSchema = z.object({
  change_set_id: z.string().min(1),
  status: ChangeSetSchema.shape.status,
  allowed_to_preview: z.boolean(),
  allowed_to_commit: z.boolean(),
  requires_confirmation: z.boolean(),
  requires_escalation: z.boolean(),
  policy_results: z.array(PolicyResultSchema),
  blocking_policy_ids: z.array(PolicyIdSchema),
  escalation_policy_ids: z.array(PolicyIdSchema)
}).strict();

export const PreviewChangeSetToolInputSchema = z.object({
  change_set_id: z.string().min(1)
}).strict();

export const PreviewChangeSetToolOutputSchema = ChangeSetPreviewSchema.extend({
  confirmation_challenge: z.object({
    phrase: z.string().min(1),
    instruction: z.string().min(1)
  }).strict(),
  non_actionable_items: z.array(z.string().min(1)),
  requires_confirmation: z.literal(true)
}).strict();

export const CaptureConfirmationToolInputSchema = z.object({
  change_set_id: z.string().min(1)
}).strict();

export const CommitChangeSetToolInputSchema = z.object({
  change_set_id: z.string().min(1),
  confirmation_id: z.string().min(1)
}).strict();

export const CreateChangeSetToolOutputSchema = ChangeSetSchema;
export const CaptureConfirmationToolOutputSchema = ConfirmationSchema;
export const CommitChangeSetToolOutputSchema = ChangeSetSchema;

export type CreateChangeSetToolInput = z.infer<
  typeof CreateChangeSetToolInputSchema
>;
export type ValidateChangeSetToolOutput = z.infer<
  typeof ValidateChangeSetToolOutputSchema
>;
export type PreviewChangeSetToolOutput = z.infer<
  typeof PreviewChangeSetToolOutputSchema
>;
