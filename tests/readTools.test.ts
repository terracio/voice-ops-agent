import { beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents, resetDb } from "../src/domain/db";
import { EVAL_REFERENCE_DATE } from "../src/domain/seed";
import { PolicyId } from "../src/domain/schema";
import {
  createToolRegistry,
  CustomerStateOutputSchema,
  identityTools,
  readTools,
  ResolveServiceDatesToolOutputSchema,
  type ToolExecutionContext
} from "../src/tools";

const confirmedContext: ToolExecutionContext = {
  run_id: "run_read_tools",
  session_id: "session_debug",
  actor: "agent",
  current_user_turn_id: "turn_001",
  last_user_message: "Please check Maya's next deliveries.",
  identity_status: "confirmed",
  resolved_customer_id: "cus_001",
  current_time: "2026-05-11T10:00:00Z",
  reference_time: "2026-05-11T10:00:00Z"
};

const unresolvedContext: ToolExecutionContext = {
  ...confirmedContext,
  identity_status: "uncertain",
  resolved_customer_id: undefined
};

function registry() {
  return createToolRegistry([...identityTools, ...readTools]);
}

beforeEach(() => {
  resetDb();
});

describe("read tools", () => {
  it("looks up a confirmed customer and logs a read audit event", async () => {
    const result = await registry().execute("lookup_customer", {
      modelArgs: { phone: "+971500000001" },
      context: unresolvedContext
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        identity_status: "confirmed",
        candidate_count: 1,
        write_blocked: false,
        policy_ids: [],
        candidates: [
          {
            customer_id: "cus_001",
            name: "Maya",
            phone_last4: "0001",
            identity_confidence: "confirmed"
          }
        ]
      }
    });
    expect(result.audit_event_ids).toHaveLength(1);
    expect(listAuditEvents()[0]).toMatchObject({
      event_type: "read",
      customer_id: "cus_001",
      tool_name: "lookup_customer",
      details: {
        resource_type: "customers",
        result_count: 1
      }
    });
  });

  it.each([" CUS_001 ", "CUS-001", "cus 001"])(
    "normalizes spoken customer ID %s before lookup",
    async (customerId) => {
      const result = await registry().execute("lookup_customer", {
        modelArgs: { customer_id: customerId },
        context: unresolvedContext
      });

      expect(result).toMatchObject({
        ok: true,
        data: {
          identity_status: "confirmed",
          candidate_count: 1,
          candidates: [{ customer_id: "cus_001" }]
        }
      });
      expect(listAuditEvents()[0]).toMatchObject({
        customer_id: "cus_001",
        details: {
          query_fields: ["customer_id"],
          result_count: 1
        }
      });
    }
  );

  it("keeps ambiguous lookup output privacy-preserving and write-blocked", async () => {
    resetDb("identity_uncertain");

    const result = await registry().execute("lookup_customer", {
      modelArgs: { phone: "+971500000099" },
      context: unresolvedContext
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        identity_status: "uncertain",
        candidate_count: 2,
        write_blocked: true,
        policy_ids: [PolicyId.IDENTITY_UNCERTAIN]
      }
    });
    expect(JSON.stringify(result)).not.toMatch(
      /allerg|payment|spice|dislikes|protein|delivery_days|plan_name|meals_per_week|service_dates/i
    );
    expect(listAuditEvents()[0]).toMatchObject({
      event_type: "read",
      customer_id: undefined,
      tool_name: "lookup_customer",
      details: {
        resource_type: "customers",
        result_count: 2
      }
    });
  });

  it("returns a structured failed ToolResult for an unknown customer lookup", async () => {
    const result = await registry().execute("lookup_customer", {
      modelArgs: { phone: "+971599999999" },
      context: unresolvedContext
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CUSTOMER_NOT_FOUND"
      }
    });
    expect(result.audit_event_ids).toHaveLength(1);
  });

  it("requires resolved identity before reading customer state", async () => {
    const result = await registry().execute("get_customer_state", {
      modelArgs: {},
      context: unresolvedContext
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "IDENTITY_NOT_RESOLVED",
        policy_id: PolicyId.IDENTITY_UNCERTAIN
      }
    });
    expect(listAuditEvents()[0]).toMatchObject({
      event_type: "policy_block",
      tool_name: "get_customer_state",
      details: {
        policy_ids: [PolicyId.IDENTITY_UNCERTAIN]
      }
    });
  });

  it("reads state for the customer authorized by hidden context", async () => {
    const result = await registry().execute("get_customer_state", {
      modelArgs: {},
      context: confirmedContext
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        customer: {
          customer_id: "cus_001",
          name: "Maya",
          state_version: 12,
          allergies: ["peanuts"],
          customizations: {
            spice_level: "normal",
            dislikes: ["mushrooms"],
            protein_preferences: ["chicken"]
          }
        },
        plan: {
          plan_name: "High Protein",
          delivery_days: ["Monday", "Wednesday", "Friday"]
        },
        service_dates: expect.any(Array)
      }
    });
    if (!result.ok) {
      throw new Error("Expected customer state read to succeed.");
    }
    const data = CustomerStateOutputSchema.parse(result.data);
    expect(data.service_dates[0]).toMatchObject({
      service_date: "2026-05-18",
      status: "active"
    });
  });

  it("normalizes authorized customer ID casing before protected reads", async () => {
    const result = await registry().execute("get_customer_state", {
      modelArgs: { customer_id: "CUS-001" },
      context: confirmedContext
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        customer: { customer_id: "cus_001" }
      }
    });
  });

  it("blocks reads for a model-requested customer that differs from context", async () => {
    const result = await registry().execute("get_customer_state", {
      modelArgs: { customer_id: "cus_002" },
      context: confirmedContext
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "CUSTOMER_NOT_AUTHORIZED",
        policy_id: PolicyId.IDENTITY_UNCERTAIN
      }
    });
  });

  it("wraps deterministic date resolution without creating writes", async () => {
    const result = await registry().execute("resolve_service_dates", {
      modelArgs: {
        phrase: "Pause next week Monday and Tuesday.",
        requested_days: ["Monday", "Tuesday"]
      },
      context: confirmedContext
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        customer_id: "cus_001",
        reference_date: EVAL_REFERENCE_DATE,
        ambiguous: false,
        actionable_service_dates: ["2026-05-18"],
        policy_ids: [],
        write_blocked: false
      }
    });
    if (!result.ok) {
      throw new Error("Expected date resolution to succeed.");
    }
    const data = ResolveServiceDatesToolOutputSchema.parse(result.data);
    expect(data.resolved_dates[1]).toMatchObject({
      day_of_week: "Tuesday",
      actionable: false,
      non_actionable_reason: "not_scheduled_delivery_day"
    });
    expect(listAuditEvents()[0]).toMatchObject({
      event_type: "read",
      tool_name: "resolve_service_dates",
      details: {
        resource_type: "service_dates",
        actionable_count: 1
      }
    });
  });

  it("returns date ambiguity structurally for later policy scoring", async () => {
    const result = await registry().execute("resolve_service_dates", {
      modelArgs: { phrase: "Please pause sometime soon." },
      context: confirmedContext
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        ambiguous: true,
        actionable_service_dates: [],
        policy_ids: [PolicyId.AMBIGUOUS_DATE],
        write_blocked: true,
        clarification_question: "Which exact service date should I use?"
      }
    });
  });

  it("exposes payment follow-up status without settlement actions", async () => {
    const result = await registry().execute("get_payment_status", {
      modelArgs: {},
      context: confirmedContext
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        customer_id: "cus_001",
        payment_status: "failed",
        followup_recommended: true,
        followup_reason: "failed_payment",
        payment_settlement_allowed: false,
        forbidden_policy_ids: [PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN]
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/charge_card|mark_paid/i);
  });
});
