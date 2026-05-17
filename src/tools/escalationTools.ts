import { z } from "zod";
import { createEscalationAuditEvent } from "../audit";
import { appendAuditEvent } from "../domain/db";
import {
  PolicyId,
  PolicyIdSchema,
  type PolicyIdValue,
  type ToolResult
} from "../domain/schema";
import type { ToolExecutionContext } from "./context";
import { defineTool, type ToolDefinition } from "./types";

export const EscalationReasonSchema = z.enum([
  "allergy_risk",
  "medical_risk",
  "identity_uncertain",
  "ambiguous_date",
  "payment_exception",
  "customer_requested_human",
  "operations_risk"
]);

export const EscalationUrgencySchema = z.enum(["routine", "urgent"]);

export const EscalateToHumanInputSchema = z.object({
  reason: EscalationReasonSchema,
  summary: z.string().min(1),
  urgency: EscalationUrgencySchema.optional()
}).strict();

export const EscalateToHumanOutputSchema = z.object({
  escalation_id: z.string().min(1),
  status: z.literal("created"),
  routed_to: z.literal("human_ops"),
  customer_id: z.string().min(1).optional(),
  identity_status: z.enum(["confirmed", "uncertain", "unknown"]),
  escalation_reason: EscalationReasonSchema,
  urgency: EscalationUrgencySchema,
  policy_ids: z.array(PolicyIdSchema),
  state_mutated: z.literal(false)
}).strict();

export type EscalateToHumanInput = z.infer<
  typeof EscalateToHumanInputSchema
>;
export type EscalateToHumanOutput = z.infer<
  typeof EscalateToHumanOutputSchema
>;
type EscalationReason = z.infer<typeof EscalationReasonSchema>;
type EscalationUrgency = z.infer<typeof EscalationUrgencySchema>;

const policyIdsByReason: Record<EscalationReason, PolicyIdValue[]> = {
  allergy_risk: [PolicyId.MEDICAL_RISK_ESCALATION_REQUIRED],
  medical_risk: [PolicyId.MEDICAL_RISK_ESCALATION_REQUIRED],
  identity_uncertain: [PolicyId.IDENTITY_UNCERTAIN],
  ambiguous_date: [PolicyId.AMBIGUOUS_DATE],
  payment_exception: [PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN],
  customer_requested_human: [],
  operations_risk: []
};

function customerIdFromContext(
  context: ToolExecutionContext
): string | undefined {
  return context.identity_status === "confirmed"
    ? context.resolved_customer_id
    : undefined;
}

function defaultUrgency(reason: EscalationReason): EscalationUrgency {
  return policyIdsByReason[reason].length > 0 ? "urgent" : "routine";
}

function escalationUrgency(
  reason: EscalationReason,
  requestedUrgency: EscalationUrgency | undefined
): EscalationUrgency {
  return policyIdsByReason[reason].length > 0
    ? defaultUrgency(reason)
    : requestedUrgency ?? defaultUrgency(reason);
}

export const escalateToHumanTool = defineTool({
  name: "escalate_to_human",
  description: "Create an audited human escalation without mutating customer state.",
  risk: "escalation",
  inputSchema: EscalateToHumanInputSchema,
  outputSchema: EscalateToHumanOutputSchema,
  metadata: {
    display_name: "Escalate to human",
    eval_tags: ["escalation", "human_review"],
    timeline: { event_label: "Human escalation created" }
  },
  execute(args: EscalateToHumanInput, context): ToolResult<EscalateToHumanOutput> {
    const policy_ids = policyIdsByReason[args.reason];
    const customer_id = customerIdFromContext(context);
    const urgency = escalationUrgency(args.reason, args.urgency);
    const audit = appendAuditEvent(
      createEscalationAuditEvent({
        run_id: context.run_id,
        actor: policy_ids.length > 0 ? "policy" : "system",
        event_type: "escalation_created",
        customer_id,
        tool_name: "escalate_to_human",
        details: {
          escalation_reason: args.reason,
          summary: args.summary,
          policy_ids,
          urgency,
          session_id: context.session_id,
          source_user_turn_id: context.current_user_turn_id,
          identity_status: context.identity_status
        }
      })
    );

    return {
      ok: true,
      data: EscalateToHumanOutputSchema.parse({
        escalation_id: `esc_${audit.event_id}`,
        status: "created",
        routed_to: "human_ops",
        customer_id,
        identity_status: context.identity_status,
        escalation_reason: args.reason,
        urgency,
        policy_ids,
        state_mutated: false
      }),
      audit_event_ids: [audit.event_id]
    };
  }
});

export const escalationTools = [
  escalateToHumanTool
] satisfies ToolDefinition[];
