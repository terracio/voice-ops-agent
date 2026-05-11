import { z } from "zod";
import {
  AuditEventSchema,
  PolicyIdSchema,
  PolicyResultSchema
} from "../domain/schema";

const SummaryDetailsSchema = z.object({
  summary: z.string().min(1).optional()
});

const ReadDetailsSchema = SummaryDetailsSchema.extend({
  resource_type: z.string().min(1),
  resource_id: z.string().min(1).optional()
}).passthrough();

const ProposedChangeDetailsSchema = SummaryDetailsSchema.extend({
  operation_count: z.number().int().positive()
}).passthrough();

const PreviewDetailsSchema = SummaryDetailsSchema.extend({
  operation_count: z.number().int().positive(),
  delta_previewed: z.boolean()
}).passthrough();

const ConfirmationDetailsSchema = SummaryDetailsSchema.extend({
  confirmation_id: z.string().min(1),
  source_user_turn_id: z.string().min(1),
  captured_by: z.literal("server"),
  confirmed_by: z.literal("user"),
  transcript_excerpt: z.string().min(1),
  confirmation_type: z.enum([
    "explicit_yes",
    "explicit_correction_then_yes"
  ])
}).passthrough();

const CommitDetailsSchema = SummaryDetailsSchema.extend({
  operation_count: z.number().int().positive(),
  committed_state_version: z.number().int().nonnegative().optional()
}).passthrough();

const PolicyDecisionDetailsSchema = SummaryDetailsSchema.extend({
  policy_ids: z.array(PolicyIdSchema).min(1),
  policy_results: z.array(PolicyResultSchema).optional()
}).passthrough();

const SideEffectDetailsSchema = SummaryDetailsSchema.extend({
  side_effect_type: z.enum(["kitchen_delta", "payment_followup"]),
  side_effect_id: z.string().min(1).optional(),
  idempotency_key: z.string().min(1)
}).passthrough();

const EscalationDetailsSchema = SummaryDetailsSchema.extend({
  escalation_reason: z.string().min(1),
  policy_ids: z.array(PolicyIdSchema).optional()
}).passthrough();

const BaseDraftSchema = z.object({
  run_id: AuditEventSchema.shape.run_id,
  customer_id: AuditEventSchema.shape.customer_id,
  tool_name: AuditEventSchema.shape.tool_name,
  change_set_id: AuditEventSchema.shape.change_set_id
});

export const AuditEventDraftSchema = z.discriminatedUnion("event_type", [
  BaseDraftSchema.extend({
    actor: z.enum(["agent", "system"]),
    event_type: z.literal("read"),
    details: ReadDetailsSchema
  }),
  BaseDraftSchema.extend({
    actor: z.enum(["agent", "system"]),
    event_type: z.literal("proposed_change"),
    customer_id: z.string().min(1),
    change_set_id: z.string().min(1),
    details: ProposedChangeDetailsSchema
  }),
  BaseDraftSchema.extend({
    actor: z.literal("system"),
    event_type: z.literal("preview"),
    customer_id: z.string().min(1),
    change_set_id: z.string().min(1),
    details: PreviewDetailsSchema
  }),
  BaseDraftSchema.extend({
    actor: z.literal("system"),
    event_type: z.literal("confirmation_captured"),
    customer_id: z.string().min(1),
    change_set_id: z.string().min(1),
    details: ConfirmationDetailsSchema
  }),
  BaseDraftSchema.extend({
    actor: z.literal("system"),
    event_type: z.literal("write_committed"),
    customer_id: z.string().min(1),
    change_set_id: z.string().min(1),
    details: CommitDetailsSchema
  }),
  BaseDraftSchema.extend({
    actor: z.enum(["system", "policy"]),
    event_type: z.literal("write_blocked"),
    customer_id: z.string().min(1),
    change_set_id: z.string().min(1),
    details: PolicyDecisionDetailsSchema
  }),
  BaseDraftSchema.extend({
    actor: z.literal("system"),
    event_type: z.literal("side_effect_created"),
    customer_id: z.string().min(1),
    change_set_id: z.string().min(1).optional(),
    details: SideEffectDetailsSchema
  }),
  BaseDraftSchema.extend({
    actor: z.enum(["system", "policy"]),
    event_type: z.literal("escalation_created"),
    customer_id: z.string().min(1).optional(),
    details: EscalationDetailsSchema
  }),
  BaseDraftSchema.extend({
    actor: z.literal("policy"),
    event_type: z.literal("policy_warning"),
    customer_id: z.string().min(1).optional(),
    details: PolicyDecisionDetailsSchema
  }),
  BaseDraftSchema.extend({
    actor: z.literal("policy"),
    event_type: z.literal("policy_block"),
    customer_id: z.string().min(1).optional(),
    details: PolicyDecisionDetailsSchema
  })
]);

export type AuditEventDraft = z.infer<typeof AuditEventDraftSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;

type DraftFor<TEventType extends AuditEventDraft["event_type"]> = Extract<
  AuditEventDraft,
  { event_type: TEventType }
>;

function parseDraft<TEventType extends AuditEventDraft["event_type"]>(
  draft: DraftFor<TEventType>
): DraftFor<TEventType> {
  return AuditEventDraftSchema.parse(draft) as DraftFor<TEventType>;
}

export const createReadAuditEvent = (input: DraftFor<"read">) =>
  parseDraft(input);

export const createProposedChangeAuditEvent = (
  input: DraftFor<"proposed_change">
) => parseDraft(input);

export const createPreviewAuditEvent = (input: DraftFor<"preview">) =>
  parseDraft(input);

export const createConfirmationCapturedAuditEvent = (
  input: DraftFor<"confirmation_captured">
) => parseDraft(input);

export const createWriteCommittedAuditEvent = (
  input: DraftFor<"write_committed">
) => parseDraft(input);

export const createWriteBlockedAuditEvent = (
  input: DraftFor<"write_blocked">
) => parseDraft(input);

export const createSideEffectAuditEvent = (
  input: DraftFor<"side_effect_created">
) => parseDraft(input);

export const createEscalationAuditEvent = (
  input: DraftFor<"escalation_created">
) => parseDraft(input);

export const createPolicyWarningAuditEvent = (
  input: DraftFor<"policy_warning">
) => parseDraft(input);

export const createPolicyBlockAuditEvent = (
  input: DraftFor<"policy_block">
) => parseDraft(input);

export function createAuditEvent(
  draft: AuditEventDraft,
  envelope: Pick<AuditEvent, "event_id" | "timestamp">
): AuditEvent {
  return AuditEventSchema.parse({
    ...draft,
    ...envelope
  });
}
