import { createPolicyBlockAuditEvent, createReadAuditEvent } from "../audit";
import { appendAuditEvent, findCustomers } from "../domain/db";
import { PolicyId, type AuditEvent, type Customer, type ToolResult } from "../domain/schema";
import type { ToolExecutionContext } from "./context";
import { normalizeCustomerId, normalizeLookupInput } from "./customerId";
import {
  ConfirmCustomerIdentityInputSchema,
  ConfirmCustomerIdentityOutputSchema,
  LookupCustomerInputSchema,
  LookupCustomerOutputSchema,
  type ConfirmCustomerIdentityInput,
  type ConfirmCustomerIdentityOutput,
  type LookupCustomerInput,
  type LookupCustomerOutput
} from "./readToolSchemas";
import { defineTool, failedToolResult, type ToolDefinition } from "./types";

type IdentityDetails = {
  resource_type: string;
  resource_id?: string;
  [key: string]: unknown;
};

function metadata(display_name: string, event_label: string, eval_tags: string[]) {
  return { display_name, eval_tags, timeline: { event_label } };
}

function readActor(actor: ToolExecutionContext["actor"]): "agent" | "system" {
  return actor === "system" ? "system" : "agent";
}

function appendIdentityReadEvent(
  toolName: string,
  context: ToolExecutionContext,
  details: IdentityDetails,
  customerId?: string
): AuditEvent {
  return appendAuditEvent(
    createReadAuditEvent({
      run_id: context.run_id,
      actor: readActor(context.actor),
      event_type: "read",
      customer_id: customerId,
      tool_name: toolName,
      details: {
        ...details,
        session_id: context.session_id,
        source_user_turn_id: context.current_user_turn_id
      }
    })
  );
}

function appendIdentityBlockEvent(
  toolName: string,
  context: ToolExecutionContext,
  summary: string,
  customerId?: string
): AuditEvent {
  return appendAuditEvent(
    createPolicyBlockAuditEvent({
      run_id: context.run_id,
      actor: "policy",
      event_type: "policy_block",
      customer_id: customerId,
      tool_name: toolName,
      details: {
        policy_ids: [PolicyId.IDENTITY_UNCERTAIN],
        summary,
        session_id: context.session_id,
        source_user_turn_id: context.current_user_turn_id
      }
    })
  );
}

function toLookupCandidate(customer: Customer) {
  return {
    customer_id: customer.customer_id,
    name: customer.name,
    phone_last4: customer.phone.slice(-4),
    identity_confidence: customer.identity_confidence
  };
}

function queryFields(input: LookupCustomerInput): string[] {
  return (["customer_id", "name", "phone"] as const).filter((field) =>
    Boolean(input[field])
  );
}

function identityConfirmationFailure(
  code: string,
  message: string,
  event: AuditEvent
): ToolResult<never> {
  return failedToolResult(
    { code, message, policy_id: PolicyId.IDENTITY_UNCERTAIN },
    [event.event_id]
  );
}

function isExplicitIdentityConfirmation(
  message: string,
  candidate: { name?: string }
): boolean {
  const normalized = message.toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (/\b(no|not|wrong|different|someone else|maybe|instead|actually)\b/.test(normalized)) {
    return false;
  }
  if (/[?]/.test(normalized)) return false;

  const candidateName = candidate.name?.toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const namePattern = candidateName
    ? new RegExp(
      `\\b((yes[, ]+)?i confirm i am|i confirm i'm|(yes[, ]+)?i am|yes[, ]+i'm|this is) ${escapeRegex(candidateName)}\\b`
    )
    : undefined;

  return /^(yes[, ]+)?(that'?s|that is) (me|my account|correct)[.!]?$/.test(normalized) ||
    /^(yes[, ]+)?correct[.!]?$/.test(normalized) ||
    /^i confirm (that'?s|that is) (me|my account)[.!]?$/.test(normalized) ||
    Boolean(namePattern?.test(normalized));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const lookupCustomerTool = defineTool({
  name: "lookup_customer",
  description: "Find possible customers from a name, phone, or customer ID.",
  risk: "read",
  inputSchema: LookupCustomerInputSchema,
  outputSchema: LookupCustomerOutputSchema,
  metadata: metadata("Lookup customer", "Customer lookup", ["read", "identity"]),
  execute(args, context): ToolResult<LookupCustomerOutput> {
    const lookupArgs = normalizeLookupInput(args);
    const customers = findCustomers(lookupArgs);
    const singleConfirmed =
      customers.length === 1 && customers[0]?.identity_confidence === "confirmed";
    const event = appendIdentityReadEvent(
      "lookup_customer",
      context,
      {
        resource_type: "customers",
        resource_id: singleConfirmed ? customers[0]?.customer_id : undefined,
        query_fields: queryFields(lookupArgs),
        result_count: customers.length
      },
      singleConfirmed ? customers[0]?.customer_id : undefined
    );

    if (customers.length === 0) {
      return failedToolResult(
        { code: "CUSTOMER_NOT_FOUND", message: "No customer matched the lookup fields." },
        [event.event_id]
      );
    }

    const uncertain = !singleConfirmed;
    return {
      ok: true,
      data: {
        identity_status: uncertain ? "uncertain" : "confirmed",
        candidate_count: customers.length,
        candidates: customers.map(toLookupCandidate),
        policy_ids: uncertain ? [PolicyId.IDENTITY_UNCERTAIN] : [],
        write_blocked: uncertain,
        clarification_question: uncertain
          ? "Please confirm the exact customer before continuing."
          : "Please ask the caller to confirm this customer before private reads."
      },
      audit_event_ids: [event.event_id]
    };
  }
});

export const confirmCustomerIdentityTool = defineTool({
  name: "confirm_customer_identity",
  description: "Confirm a pending customer lookup after the caller explicitly confirms the candidate.",
  risk: "read",
  inputSchema: ConfirmCustomerIdentityInputSchema,
  outputSchema: ConfirmCustomerIdentityOutputSchema,
  metadata: metadata("Confirm customer identity", "Customer identity confirmed", ["read", "identity"]),
  execute(args: ConfirmCustomerIdentityInput, context): ToolResult<ConfirmCustomerIdentityOutput> {
    const candidate = context.pending_identity_candidate;
    if (!candidate) {
      const event = appendIdentityBlockEvent(
        "confirm_customer_identity",
        context,
        "No pending customer lookup candidate exists."
      );
      return identityConfirmationFailure(
        "IDENTITY_CONFIRMATION_REQUIRED",
        "Look up a single customer candidate before confirming identity.",
        event
      );
    }

    const requestedCustomerId = normalizeCustomerId(args.customer_id);
    if (requestedCustomerId && requestedCustomerId !== candidate.customer_id) {
      const event = appendIdentityBlockEvent(
        "confirm_customer_identity",
        context,
        "Requested customer does not match the pending identity candidate.",
        requestedCustomerId
      );
      return identityConfirmationFailure(
        "CUSTOMER_NOT_AUTHORIZED",
        "The requested customer does not match the pending lookup candidate.",
        event
      );
    }

    if (
      context.current_user_turn_id === candidate.lookup_user_turn_id ||
      !isExplicitIdentityConfirmation(context.last_user_message, candidate)
    ) {
      const event = appendIdentityBlockEvent(
        "confirm_customer_identity",
        context,
        "Identity confirmation must come from an explicit user turn after lookup.",
        candidate.customer_id
      );
      return identityConfirmationFailure(
        "IDENTITY_CONFIRMATION_NOT_EXPLICIT",
        "Ask the caller to confirm the pending customer before private account access.",
        event
      );
    }

    const event = appendIdentityReadEvent(
      "confirm_customer_identity",
      context,
      {
        resource_type: "customer_identity",
        resource_id: candidate.customer_id,
        confirmed_from_turn_id: context.current_user_turn_id
      },
      candidate.customer_id
    );

    return {
      ok: true,
      data: ConfirmCustomerIdentityOutputSchema.parse({
        identity_status: "confirmed",
        customer_id: candidate.customer_id,
        name: candidate.name,
        phone_last4: candidate.phone_last4,
        confirmed_from_turn_id: context.current_user_turn_id,
        policy_ids: [],
        write_blocked: false
      }),
      audit_event_ids: [event.event_id]
    };
  }
});

export const identityTools = [
  lookupCustomerTool,
  confirmCustomerIdentityTool
] satisfies ToolDefinition[];
