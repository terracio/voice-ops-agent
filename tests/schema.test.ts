import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AuditEventSchema,
  ChangeOperationSchema,
  ChangeSetSchema,
  ConfirmationSchema,
  createToolResultSchema,
  CustomerSchema,
  KitchenExportDeltaSchema,
  PaymentFollowupSchema,
  PolicyId,
  PolicyIdSchema,
  PlanSchema,
  ServiceDateSchema,
  ToolErrorSchema
} from "../src/domain/schema";

const mayaCustomer = {
  customer_id: "cus_001",
  name: "Maya",
  phone: "+971500000001",
  timezone: "Asia/Dubai",
  state_version: 12,
  plan_id: "plan_001",
  allergies: ["peanuts"],
  customizations: {
    spice_level: "normal",
    dislikes: ["mushrooms"],
    protein_preferences: ["chicken"]
  },
  payment_status: "failed",
  payment_last_checked_at: "2026-05-10T12:00:00+04:00"
};

describe("domain schemas", () => {
  it("validates core customer, plan, and service date records", () => {
    expect(CustomerSchema.parse(mayaCustomer).identity_confidence).toBe(
      "confirmed"
    );

    expect(() =>
      PlanSchema.parse({
        plan_id: "plan_001",
        customer_id: "cus_001",
        plan_name: "High Protein",
        meals_per_week: 3,
        delivery_days: ["Monday", "Wednesday", "Friday"],
        status: "active"
      })
    ).not.toThrow();

    expect(() =>
      ServiceDateSchema.parse({
        service_date: "2026-05-18",
        day_of_week: "Monday",
        status: "active",
        kitchen_cutoff_at: "2026-05-16T12:00:00+04:00",
        kitchen_locked: false
      })
    ).not.toThrow();
  });

  it("rejects invalid plan days and service date formats", () => {
    expect(() =>
      PlanSchema.parse({
        plan_id: "plan_001",
        customer_id: "cus_001",
        plan_name: "High Protein",
        meals_per_week: 3,
        delivery_days: ["Funday"],
        status: "active"
      })
    ).toThrow();

    expect(() =>
      ServiceDateSchema.parse({
        service_date: "May 18",
        day_of_week: "Monday",
        status: "active",
        kitchen_cutoff_at: "2026-05-16T12:00:00+04:00",
        kitchen_locked: false
      })
    ).toThrow();
  });

  it("validates allowed change operations and rejects unsafe shapes", () => {
    expect(() =>
      ChangeOperationSchema.parse({
        type: "pause_dates",
        dates: ["2026-05-18"],
        reason: "travel"
      })
    ).not.toThrow();

    expect(() =>
      ChangeOperationSchema.parse({
        type: "update_customization",
        field: "spice_level",
        previous_value: "normal",
        next_value: "spicy"
      })
    ).not.toThrow();

    expect(() =>
      ChangeOperationSchema.parse({
        type: "update_customization",
        field: "allergies",
        previous_value: ["peanuts"],
        next_value: []
      })
    ).toThrow();

    expect(() =>
      ChangeOperationSchema.parse({
        type: "update_customization",
        field: "spice_level",
        previous_value: "normal",
        next_value: "volcano"
      })
    ).toThrow();

    expect(() =>
      ChangeOperationSchema.parse({
        type: "create_payment_followup",
        reason: "failed_payment"
      })
    ).not.toThrow();

    expect(() =>
      ChangeOperationSchema.parse({
        type: "create_kitchen_export_delta",
        affected_dates: ["2026-05-18"]
      })
    ).toThrow();
  });

  it("validates ChangeSet, confirmation, side effect, and audit records", () => {
    const changeSet = ChangeSetSchema.parse({
      change_set_id: "cs_001",
      customer_id: "cus_001",
      status: "draft",
      operations: [
        {
          type: "pause_dates",
          dates: ["2026-05-18"],
          reason: "travel"
        }
      ],
      expected_state_version: 12,
      created_at: "2026-05-11T10:00:00Z",
      expires_at: "2026-05-11T10:15:00Z"
    });

    expect(changeSet.policy_results).toEqual([]);

    expect(() =>
      ConfirmationSchema.parse({
        confirmation_id: "conf_001",
        run_id: "run_001",
        customer_id: "cus_001",
        change_set_id: "cs_001",
        source_user_turn_id: "turn_002",
        captured_by: "server",
        confirmed_by: "user",
        previewed_at: "2026-05-11T10:04:00Z",
        confirmed_at: "2026-05-11T10:05:00Z",
        transcript_excerpt: "Yes, confirm.",
        confirmation_source: "debug_user_turn",
        confirmation_type: "explicit_yes"
      })
    ).not.toThrow();

    expect(() =>
      ConfirmationSchema.parse({
        confirmation_id: "conf_002",
        run_id: "run_001",
        customer_id: "cus_001",
        change_set_id: "cs_001",
        source_user_turn_id: "turn_002",
        captured_by: "agent",
        confirmed_by: "user",
        previewed_at: "2026-05-11T10:04:00Z",
        confirmed_at: "2026-05-11T10:05:00Z",
        transcript_excerpt: "Yes, confirm.",
        confirmation_source: "debug_user_turn",
        confirmation_type: "explicit_yes"
      })
    ).toThrow();

    expect(() =>
      ConfirmationSchema.parse({
        confirmation_id: "conf_003",
        run_id: "run_001",
        customer_id: "cus_001",
        change_set_id: "cs_001",
        source_user_turn_id: "turn_002",
        captured_by: "server",
        confirmed_by: "user",
        previewed_at: "2026-05-11T10:05:00Z",
        confirmed_at: "2026-05-11T10:04:00Z",
        transcript_excerpt: "Yes, confirm.",
        confirmation_source: "debug_user_turn",
        confirmation_type: "explicit_yes"
      })
    ).toThrow();

    expect(() =>
      PaymentFollowupSchema.parse({
        followup_id: "pf_001",
        customer_id: "cus_001",
        idempotency_key: "cs_001:create_payment_followup:0",
        reason: "failed_payment",
        status: "open",
        created_at: "2026-05-11T10:06:00Z",
        source_change_set_id: "cs_001"
      })
    ).not.toThrow();

    expect(() =>
      KitchenExportDeltaSchema.parse({
        delta_id: "kd_001",
        customer_id: "cus_001",
        change_set_id: "cs_001",
        idempotency_key: "cs_001:kitchen_delta",
        affected_dates: ["2026-05-18"],
        summary: "Pause Monday May 18.",
        created_at: "2026-05-11T10:07:00Z"
      })
    ).not.toThrow();

    expect(() =>
      AuditEventSchema.parse({
        event_id: "audit_001",
        timestamp: "2026-05-11T10:08:00Z",
        run_id: "run_001",
        actor: "policy",
        event_type: "policy_block",
        customer_id: "cus_001",
        tool_name: "commit_change_set",
        change_set_id: "cs_001",
        details: { policy_id: PolicyId.STALE_STATE_VERSION }
      })
    ).not.toThrow();
  });

  it("uses stable policy IDs for policy results and tool errors", () => {
    expect(PolicyIdSchema.parse(PolicyId.MISSING_CONFIRMATION)).toBe(
      "P004_MISSING_CONFIRMATION"
    );
    expect(() => PolicyIdSchema.parse("P004")).toThrow();
  });

  it("builds typed tool result schemas", () => {
    const PaymentStatusResultSchema = createToolResultSchema(
      z.object({
        payment_status: z.literal("failed")
      })
    );

    expect(() =>
      PaymentStatusResultSchema.parse({
        ok: true,
        data: { payment_status: "failed" },
        audit_event_ids: ["audit_001"]
      })
    ).not.toThrow();

    expect(() =>
      PaymentStatusResultSchema.parse({
        ok: false,
        error: ToolErrorSchema.parse({
          code: "POLICY_BLOCKED",
          message: "Write requires confirmation.",
          policy_id: PolicyId.MISSING_CONFIRMATION
        }),
        audit_event_ids: ["audit_002"]
      })
    ).not.toThrow();

    expect(() =>
      PaymentStatusResultSchema.parse({
        ok: true,
        error: {
          code: "INVALID",
          message: "Successful tool results cannot carry errors."
        },
        audit_event_ids: []
      })
    ).toThrow();
  });
});
