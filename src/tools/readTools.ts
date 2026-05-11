import { createPolicyBlockAuditEvent, createReadAuditEvent } from "../audit";
import { appendAuditEvent, findCustomers, getCustomer, getCustomerState, type CustomerState } from "../domain/db";
import { resolveServiceDatesForState } from "../domain/dateResolver";
import { EVAL_REFERENCE_DATE } from "../domain/seed";
import { PolicyId, type AuditEvent, type Customer, type DateString, type PaymentStatus, type ToolError, type ToolResult } from "../domain/schema";
import type { ToolExecutionContext } from "./context";
import { AuthorizedCustomerInputSchema, CustomerStateOutputSchema, LookupCustomerInputSchema, LookupCustomerOutputSchema, PaymentStatusInputSchema, PaymentStatusOutputSchema, ResolveServiceDatesToolInputSchema, ResolveServiceDatesToolOutputSchema, ToolReferenceDateSchema, type AuthorizedCustomerInput, type CustomerStateOutput, type LookupCustomerInput, type LookupCustomerOutput, type PaymentStatusOutput, type ResolveServiceDatesToolInput, type ResolveServiceDatesToolOutput } from "./readToolSchemas";
import { defineTool, failedToolResult, type ToolDefinition } from "./types";

type ReadDetails = { resource_type: string; resource_id?: string; [key: string]: unknown };
type AuthorizedCustomerResult = { ok: true; customerId: string } | { ok: false; result: ToolResult<never> };

function metadata(display_name: string, event_label: string, eval_tags: string[]) {
  return { display_name, eval_tags, timeline: { event_label } };
}

function readActor(actor: ToolExecutionContext["actor"]): "agent" | "system" {
  return actor === "system" ? "system" : "agent";
}

function appendReadEvent(toolName: string, context: ToolExecutionContext, details: ReadDetails, customerId?: string): AuditEvent {
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

function appendIdentityBlockEvent(toolName: string, context: ToolExecutionContext, summary: string, customerId?: string): AuditEvent {
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

function identityFailure(code: "IDENTITY_NOT_RESOLVED" | "CUSTOMER_NOT_AUTHORIZED", message: string): ToolError {
  return { code, message, policy_id: PolicyId.IDENTITY_UNCERTAIN };
}

function authorizationFailure(
  code: "IDENTITY_NOT_RESOLVED" | "CUSTOMER_NOT_AUTHORIZED",
  message: string,
  event: AuditEvent
): AuthorizedCustomerResult {
  return { ok: false, result: failedToolResult(identityFailure(code, message), [event.event_id]) };
}

function authorizeCustomer(
  args: AuthorizedCustomerInput,
  context: ToolExecutionContext,
  toolName: string
): AuthorizedCustomerResult {
  if (context.identity_status !== "confirmed" || !context.resolved_customer_id) {
    const event = appendIdentityBlockEvent(
      toolName,
      context,
      "Resolved customer identity is required before this read."
    );
    return authorizationFailure(
      "IDENTITY_NOT_RESOLVED",
      "Resolve the customer identity before reading customer data.",
      event
    );
  }

  if (args.customer_id && args.customer_id !== context.resolved_customer_id) {
    const event = appendIdentityBlockEvent(
      toolName,
      context,
      "Requested customer does not match the hidden resolved identity.",
      args.customer_id
    );
    return authorizationFailure(
      "CUSTOMER_NOT_AUTHORIZED",
      "The requested customer is not authorized by the resolved identity.",
      event
    );
  }

  return { ok: true, customerId: context.resolved_customer_id };
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

function customerStateOutput(state: CustomerState): CustomerStateOutput {
  const { customer, plan } = state;
  return CustomerStateOutputSchema.parse({
    customer: {
      customer_id: customer.customer_id,
      name: customer.name,
      timezone: customer.timezone,
      identity_confidence: customer.identity_confidence,
      state_version: customer.state_version,
      allergies: customer.allergies,
      customizations: customer.customizations
    },
    plan: { plan_id: plan.plan_id, plan_name: plan.plan_name, meals_per_week: plan.meals_per_week, delivery_days: plan.delivery_days, status: plan.status },
    service_dates: state.service_dates
  });
}

function referenceDateFromContext(context: ToolExecutionContext): DateString {
  const referenceTime = context.reference_time ?? context.current_time;
  return referenceTime
    ? ToolReferenceDateSchema.parse(referenceTime.slice(0, 10))
    : EVAL_REFERENCE_DATE;
}

function paymentFollowupReason(status: PaymentStatus) {
  if (status === "failed") return "failed_payment" as const;
  if (status === "past_due") return "past_due" as const;
  if (status === "unknown") return "unknown_status" as const;
  return undefined;
}

function customerNotFound<TData>(
  toolName: string,
  context: ToolExecutionContext,
  customerId: string,
  resourceType: string
): ToolResult<TData> {
  const event = appendReadEvent(
    toolName,
    context,
    { resource_type: resourceType, resource_id: customerId, result: "not_found" },
    customerId
  );
  return failedToolResult(
    { code: "CUSTOMER_NOT_FOUND", message: `No customer found for ${customerId}.` },
    [event.event_id]
  );
}

export const lookupCustomerTool = defineTool({
  name: "lookup_customer",
  description: "Find possible customers from a name, phone, or customer ID.",
  risk: "read",
  inputSchema: LookupCustomerInputSchema,
  outputSchema: LookupCustomerOutputSchema,
  metadata: metadata("Lookup customer", "Customer lookup", ["read", "identity"]),
  execute(args, context): ToolResult<LookupCustomerOutput> {
    const customers = findCustomers(args);
    const singleConfirmed =
      customers.length === 1 && customers[0]?.identity_confidence === "confirmed";
    const event = appendReadEvent(
      "lookup_customer",
      context,
      {
        resource_type: "customers",
        resource_id: singleConfirmed ? customers[0]?.customer_id : undefined,
        query_fields: queryFields(args),
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
          : undefined
      },
      audit_event_ids: [event.event_id]
    };
  }
});

export const getCustomerStateTool = defineTool({
  name: "get_customer_state",
  description: "Read plan, customization, allergy, and service-date state.",
  risk: "read",
  inputSchema: AuthorizedCustomerInputSchema,
  outputSchema: CustomerStateOutputSchema,
  metadata: metadata("Get customer state", "Customer state read", ["read", "state"]),
  execute(args, context): ToolResult<CustomerStateOutput> {
    const authorized = authorizeCustomer(args, context, "get_customer_state");
    if (!authorized.ok) return authorized.result;

    const state = getCustomerState(authorized.customerId);
    if (!state) {
      return customerNotFound("get_customer_state", context, authorized.customerId, "customer_state");
    }

    const event = appendReadEvent(
      "get_customer_state",
      context,
      {
        resource_type: "customer_state",
        resource_id: authorized.customerId,
        service_date_count: state.service_dates.length
      },
      authorized.customerId
    );
    return {
      ok: true,
      data: customerStateOutput(state),
      audit_event_ids: [event.event_id]
    };
  }
});

export const resolveServiceDatesTool = defineTool({
  name: "resolve_service_dates",
  description: "Resolve requested delivery dates using deterministic state.",
  risk: "read",
  inputSchema: ResolveServiceDatesToolInputSchema,
  outputSchema: ResolveServiceDatesToolOutputSchema,
  metadata: metadata("Resolve service dates", "Service dates resolved", ["read", "date_resolution"]),
  execute(args: ResolveServiceDatesToolInput, context): ToolResult<ResolveServiceDatesToolOutput> {
    const authorized = authorizeCustomer({}, context, "resolve_service_dates");
    if (!authorized.ok) return authorized.result;

    const state = getCustomerState(authorized.customerId);
    if (!state) {
      return customerNotFound("resolve_service_dates", context, authorized.customerId, "service_dates");
    }

    const resolved = resolveServiceDatesForState(
      {
        customer_id: authorized.customerId,
        phrase: args.phrase,
        requested_days: args.requested_days,
        reference_date: referenceDateFromContext(context)
      },
      state
    );
    const event = appendReadEvent(
      "resolve_service_dates",
      context,
      {
        resource_type: "service_dates",
        resource_id: authorized.customerId,
        ambiguous: resolved.ambiguous,
        resolved_count: resolved.resolved_dates.length,
        actionable_count: resolved.actionable_service_dates.length
      },
      authorized.customerId
    );

    return {
      ok: true,
      data: ResolveServiceDatesToolOutputSchema.parse({
        ...resolved,
        policy_ids: resolved.ambiguous ? [PolicyId.AMBIGUOUS_DATE] : [],
        write_blocked: resolved.ambiguous
      }),
      audit_event_ids: [event.event_id]
    };
  }
});

export const getPaymentStatusTool = defineTool({
  name: "get_payment_status",
  description: "Read payment status for follow-up planning only.",
  risk: "read",
  inputSchema: PaymentStatusInputSchema,
  outputSchema: PaymentStatusOutputSchema,
  metadata: metadata("Get payment status", "Payment status read", ["read", "payment"]),
  execute(args, context): ToolResult<PaymentStatusOutput> {
    const authorized = authorizeCustomer(args, context, "get_payment_status");
    if (!authorized.ok) return authorized.result;

    const customer = getCustomer(authorized.customerId);
    if (!customer) {
      return customerNotFound("get_payment_status", context, authorized.customerId, "payment_status");
    }

    const followupReason = paymentFollowupReason(customer.payment_status);
    const event = appendReadEvent(
      "get_payment_status",
      context,
      {
        resource_type: "payment_status",
        resource_id: customer.customer_id,
        payment_status: customer.payment_status,
        followup_recommended: Boolean(followupReason)
      },
      customer.customer_id
    );

    return {
      ok: true,
      data: PaymentStatusOutputSchema.parse({
        customer_id: customer.customer_id,
        payment_status: customer.payment_status,
        payment_last_checked_at: customer.payment_last_checked_at,
        followup_recommended: Boolean(followupReason),
        followup_reason: followupReason,
        payment_settlement_allowed: false,
        forbidden_policy_ids: [PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN]
      }),
      audit_event_ids: [event.event_id]
    };
  }
});

export const readTools = [lookupCustomerTool, getCustomerStateTool, resolveServiceDatesTool, getPaymentStatusTool] satisfies ToolDefinition[];
