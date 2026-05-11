import { describe, expect, it } from "vitest";
import {
  createAuditLog,
  createConfirmationCapturedAuditEvent,
  createEscalationAuditEvent,
  createPolicyBlockAuditEvent,
  createPolicyWarningAuditEvent,
  createPreviewAuditEvent,
  createProposedChangeAuditEvent,
  createReadAuditEvent,
  createSideEffectAuditEvent,
  createWriteBlockedAuditEvent,
  createWriteCommittedAuditEvent
} from "../src/audit";
import { PolicyId } from "../src/domain/schema";

function createDeterministicAuditLog() {
  let sequence = 0;

  return createAuditLog({
    createEventId: () => `audit_${String(++sequence).padStart(3, "0")}`,
    now: () => `2026-05-11T10:00:${String(sequence).padStart(2, "0")}Z`
  });
}

describe("audit log foundation", () => {
  it("appends events and queries by run and ChangeSet in append order", () => {
    const log = createDeterministicAuditLog();

    log.append(
      createReadAuditEvent({
        run_id: "run_001",
        actor: "agent",
        event_type: "read",
        customer_id: "cus_001",
        tool_name: "get_customer",
        details: {
          resource_type: "customer",
          resource_id: "cus_001"
        }
      })
    );

    log.append(
      createProposedChangeAuditEvent({
        run_id: "run_001",
        actor: "agent",
        event_type: "proposed_change",
        customer_id: "cus_001",
        tool_name: "propose_change_set",
        change_set_id: "cs_001",
        details: {
          operation_count: 2,
          summary: "Pause Monday and update spice level."
        }
      })
    );

    log.append(
      createPreviewAuditEvent({
        run_id: "run_001",
        actor: "system",
        event_type: "preview",
        customer_id: "cus_001",
        tool_name: "preview_change_set",
        change_set_id: "cs_001",
        details: {
          operation_count: 2,
          delta_previewed: true
        }
      })
    );

    log.append(
      createReadAuditEvent({
        run_id: "run_002",
        actor: "agent",
        event_type: "read",
        customer_id: "cus_002",
        tool_name: "get_customer",
        details: {
          resource_type: "customer",
          resource_id: "cus_002"
        }
      })
    );

    expect(log.listEvents().map((event) => event.event_id)).toEqual([
      "audit_001",
      "audit_002",
      "audit_003",
      "audit_004"
    ]);
    expect(log.getEventsByRunId("run_001").map((event) => event.event_type))
      .toEqual(["read", "proposed_change", "preview"]);
    expect(
      log.getEventsByChangeSetId("cs_001").map((event) => event.event_type)
    ).toEqual(["proposed_change", "preview"]);
    expect(
      log
        .getEventsByRunAndChangeSetId("run_001", "cs_001")
        .map((event) => event.event_id)
    ).toEqual(["audit_002", "audit_003"]);
  });

  it("records confirmation capture as a server event distinct from model text", () => {
    const log = createDeterministicAuditLog();

    const event = log.append(
      createConfirmationCapturedAuditEvent({
        run_id: "run_001",
        actor: "system",
        event_type: "confirmation_captured",
        customer_id: "cus_001",
        tool_name: "capture_confirmation",
        change_set_id: "cs_001",
        details: {
          confirmation_id: "conf_001",
          source_user_turn_id: "turn_004",
          captured_by: "server",
          confirmed_by: "user",
          transcript_excerpt: "Yes, confirm those changes.",
          confirmation_type: "explicit_yes"
        }
      })
    );

    expect(event.actor).toBe("system");
    expect(event.details).toMatchObject({
      confirmation_id: "conf_001",
      captured_by: "server",
      confirmed_by: "user",
      transcript_excerpt: "Yes, confirm those changes."
    });
  });

  it("supports run-scoped append and ChangeSet query helpers", () => {
    const log = createDeterministicAuditLog();
    const runLog = log.forRun("run_003");

    const event = runLog.append({
      actor: "system",
      event_type: "preview",
      customer_id: "cus_003",
      tool_name: "preview_change_set",
      change_set_id: "cs_003",
      details: {
        operation_count: 1,
        delta_previewed: true
      }
    });

    expect(event.run_id).toBe("run_003");
    expect(runLog.listEvents().map((entry) => entry.event_id)).toEqual([
      "audit_001"
    ]);
    expect(runLog.getEventsByChangeSetId("cs_003")[0]?.event_type).toBe(
      "preview"
    );
  });

  it("records commits, blocks, warnings, and escalations with stable policy IDs", () => {
    const log = createDeterministicAuditLog();

    log.appendMany([
      createWriteCommittedAuditEvent({
        run_id: "run_001",
        actor: "system",
        event_type: "write_committed",
        customer_id: "cus_001",
        tool_name: "commit_change_set",
        change_set_id: "cs_001",
        details: {
          operation_count: 2,
          committed_state_version: 13
        }
      }),
      createWriteBlockedAuditEvent({
        run_id: "run_001",
        actor: "policy",
        event_type: "write_blocked",
        customer_id: "cus_001",
        tool_name: "commit_change_set",
        change_set_id: "cs_002",
        details: {
          policy_ids: [PolicyId.MISSING_CONFIRMATION],
          summary: "Commit blocked without explicit confirmation."
        }
      }),
      createPolicyWarningAuditEvent({
        run_id: "run_001",
        actor: "policy",
        event_type: "policy_warning",
        customer_id: "cus_001",
        tool_name: "preview_change_set",
        change_set_id: "cs_003",
        details: {
          policy_ids: [PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA],
          policy_results: [
            {
              policy_id: PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA,
              severity: "warning",
              passed: false,
              message: "Customization overwrite requires a visible delta."
            }
          ]
        }
      }),
      createPolicyBlockAuditEvent({
        run_id: "run_001",
        actor: "policy",
        event_type: "policy_block",
        customer_id: "cus_001",
        tool_name: "commit_change_set",
        change_set_id: "cs_004",
        details: {
          policy_ids: [PolicyId.STALE_STATE_VERSION]
        }
      }),
      createEscalationAuditEvent({
        run_id: "run_001",
        actor: "policy",
        event_type: "escalation_created",
        customer_id: "cus_001",
        tool_name: "policy_engine",
        details: {
          escalation_reason: "Allergy or medical risk requires human review.",
          policy_ids: [PolicyId.MEDICAL_RISK_ESCALATION_REQUIRED]
        }
      })
    ]);

    expect(log.getEventsByRunId("run_001").map((event) => event.event_type))
      .toEqual([
        "write_committed",
        "write_blocked",
        "policy_warning",
        "policy_block",
        "escalation_created"
      ]);
    expect(log.getEventsByChangeSetId("cs_002")[0]?.details).toMatchObject({
      policy_ids: [PolicyId.MISSING_CONFIRMATION]
    });

    const invalidPolicyDraft = {
      run_id: "run_001",
      actor: "policy",
      event_type: "policy_block",
      details: {
        policy_ids: ["P004"]
      }
    } as unknown as Parameters<typeof createPolicyBlockAuditEvent>[0];

    expect(() => createPolicyBlockAuditEvent(invalidPolicyDraft)).toThrow();
  });

  it("represents kitchen and payment materialization as side-effect events", () => {
    const log = createDeterministicAuditLog();

    log.appendMany([
      createSideEffectAuditEvent({
        run_id: "run_001",
        actor: "system",
        event_type: "side_effect_created",
        customer_id: "cus_001",
        tool_name: "materialize_kitchen_delta",
        change_set_id: "cs_001",
        details: {
          side_effect_type: "kitchen_delta",
          side_effect_id: "kd_001",
          idempotency_key: "cs_001:kitchen_delta"
        }
      }),
      createSideEffectAuditEvent({
        run_id: "run_001",
        actor: "system",
        event_type: "side_effect_created",
        customer_id: "cus_001",
        tool_name: "materialize_payment_followup",
        change_set_id: "cs_001",
        details: {
          side_effect_type: "payment_followup",
          side_effect_id: "pf_001",
          idempotency_key: "cs_001:create_payment_followup:0"
        }
      })
    ]);

    expect(
      log.getEventsByChangeSetId("cs_001").map((event) => event.details)
    ).toEqual([
      expect.objectContaining({
        side_effect_type: "kitchen_delta",
        idempotency_key: "cs_001:kitchen_delta"
      }),
      expect.objectContaining({
        side_effect_type: "payment_followup",
        idempotency_key: "cs_001:create_payment_followup:0"
      })
    ]);
  });
});
