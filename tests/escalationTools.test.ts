import { beforeEach, describe, expect, it } from "vitest";
import * as db from "../src/domain/db";
import { PolicyId, type ToolResult } from "../src/domain/schema";
import {
  createToolRegistry,
  escalationTools,
  type EscalateToHumanOutput,
  type ToolExecutionContext
} from "../src/tools";

const context: ToolExecutionContext = {
  run_id: "run_escalation_tools",
  session_id: "session_debug",
  actor: "agent",
  current_user_turn_id: "turn_001",
  last_user_message: "I may have an allergy concern.",
  identity_status: "confirmed",
  resolved_customer_id: "cus_001",
  current_time: "2026-05-11T10:00:00Z",
  reference_time: "2026-05-11T10:00:00Z"
};

beforeEach(() => db.resetDb());

function registry() {
  return createToolRegistry(escalationTools);
}

function expectData<T>(result: ToolResult<unknown>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data as T;
}

describe("escalation tools", () => {
  it("exports escalate_to_human with escalation risk metadata", () => {
    expect(escalationTools.map((tool) => [tool.name, tool.risk])).toEqual([
      ["escalate_to_human", "escalation"]
    ]);
    expect(escalationTools[0]?.metadata).toMatchObject({
      display_name: "Escalate to human",
      eval_tags: ["escalation", "human_review"]
    });
  });

  it("logs allergy risk escalation without mutating operational state", async () => {
    const beforeState = db.getCustomerState("cus_001");
    const beforePaymentStatus = db.getCustomer("cus_001")?.payment_status;

    const result = expectData<EscalateToHumanOutput>(
      await registry().execute("escalate_to_human", {
        modelArgs: {
          reason: "allergy_risk",
          summary: "Customer mentioned a possible peanut reaction."
        },
        context
      })
    );

    expect(result).toMatchObject({
      status: "created",
      routed_to: "human_ops",
      customer_id: "cus_001",
      identity_status: "confirmed",
      escalation_reason: "allergy_risk",
      urgency: "urgent",
      policy_ids: [PolicyId.MEDICAL_RISK_ESCALATION_REQUIRED],
      state_mutated: false
    });
    expect(result.escalation_id).toMatch(/^esc_audit_/);
    expect(db.getCustomerState("cus_001")).toEqual(beforeState);
    expect(db.getCustomer("cus_001")?.payment_status).toBe(beforePaymentStatus);
    expect(db.listPaymentFollowups("cus_001")).toHaveLength(0);
    expect(db.listKitchenExportDeltas("cus_001")).toHaveLength(0);
    expect(db.listAuditEvents()[0]).toMatchObject({
      actor: "policy",
      event_type: "escalation_created",
      customer_id: "cus_001",
      tool_name: "escalate_to_human",
      details: {
        escalation_reason: "allergy_risk",
        summary: "Customer mentioned a possible peanut reaction.",
        policy_ids: [PolicyId.MEDICAL_RISK_ESCALATION_REQUIRED],
        source_user_turn_id: "turn_001"
      }
    });
  });

  it("can escalate uncertain identity without selecting a customer", async () => {
    const result = expectData<EscalateToHumanOutput>(
      await registry().execute("escalate_to_human", {
        modelArgs: {
          reason: "identity_uncertain",
          summary: "Two possible customers matched the same phone number."
        },
        context: {
          ...context,
          identity_status: "uncertain",
          resolved_customer_id: undefined
        }
      })
    );

    expect(result).toMatchObject({
      identity_status: "uncertain",
      escalation_reason: "identity_uncertain",
      urgency: "urgent",
      policy_ids: [PolicyId.IDENTITY_UNCERTAIN],
      state_mutated: false
    });
    expect(result.customer_id).toBeUndefined();
    expect(db.listAuditEvents()[0]).toMatchObject({
      event_type: "escalation_created",
      customer_id: undefined,
      details: {
        identity_status: "uncertain",
        policy_ids: [PolicyId.IDENTITY_UNCERTAIN]
      }
    });
  });

  it("does not allow the model to provide a customer identity", async () => {
    await expect(
      registry().execute("escalate_to_human", {
        modelArgs: {
          reason: "medical_risk",
          summary: "Customer asked for medical advice.",
          customer_id: "cus_002"
        },
        context
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_INVALID_ARGS" }
    });
  });

  it("does not allow the model to provide audit provenance", async () => {
    await expect(
      registry().execute("escalate_to_human", {
        modelArgs: {
          reason: "operations_risk",
          summary: "Customer needs manual review.",
          source_tool_name: "commit_change_set"
        },
        context
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_INVALID_ARGS" }
    });
  });
});
