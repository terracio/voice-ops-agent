import { describe, expect, it } from "vitest";
import { PolicyId } from "../src/domain/schema";
import {
  REALTIME_EVIDENCE_SCHEMA_VERSION,
  RealtimeEvidenceSnapshotSchema
} from "../src/evidence/realtimeEvidence";

const now = "2026-05-14T09:00:00.000Z";

describe("Realtime browser evidence contract", () => {
  it("validates committed ChangeSet evidence with a written diff", () => {
    const parsed = RealtimeEvidenceSnapshotSchema.parse({
      schema_version: REALTIME_EVIDENCE_SCHEMA_VERSION,
      call_id: "rtc_demo_123456",
      run_id: "browser_rtc_demo_123456",
      status: "ended",
      generated_at: now,
      transcript: [{
        evidence_id: "tr_user_1",
        created_at: now,
        turn_id: "turn_user_1",
        actor: "user",
        transcript_kind: "realtime_transcript",
        is_operational_source: false,
        text: "Please make my meals spicy next week.",
        source: { turn_id: "turn_user_1" }
      }],
      tools: [{
        evidence_id: "tool_preview_1",
        created_at: now,
        tool_call_id: "call_preview_1",
        tool_name: "preview_change_set",
        risk: "preview",
        status: "ok",
        input: { change_set_id: "cs_001" },
        output: { change_set_id: "cs_001" },
        audit_event_ids: ["aud_preview_1"],
        source: {
          audit_event_id: "aud_preview_1",
          change_set_id: "cs_001",
          tool_call_id: "call_preview_1"
        }
      }],
      audit_events: [{
        evidence_id: "audit_commit_1",
        created_at: now,
        source: { audit_event_id: "aud_commit_1", change_set_id: "cs_001" },
        audit_event: {
          event_id: "aud_commit_1",
          timestamp: now,
          run_id: "browser_rtc_demo_123456",
          actor: "agent",
          event_type: "write_committed",
          customer_id: "cus_001",
          tool_name: "commit_change_set",
          change_set_id: "cs_001",
          details: { confirmation_id: "conf_001" }
        }
      }],
      confirmations: [{
        evidence_id: "conf_ev_1",
        created_at: now,
        status: "captured",
        source: {
          change_set_id: "cs_001",
          confirmation_id: "conf_001",
          turn_id: "turn_user_confirm"
        },
        confirmation: {
          confirmation_id: "conf_001",
          run_id: "browser_rtc_demo_123456",
          customer_id: "cus_001",
          change_set_id: "cs_001",
          source_user_turn_id: "turn_user_confirm",
          captured_by: "server",
          confirmed_by: "user",
          previewed_at: "2026-05-14T09:00:01.000Z",
          confirmed_at: "2026-05-14T09:00:05.000Z",
          transcript_excerpt: "Yes, make it spicy.",
          confirmation_source: "realtime_user_turn",
          confirmation_type: "explicit_yes"
        }
      }],
      change_sets: [{
        evidence_id: "cs_ev_1",
        created_at: now,
        change_set_id: "cs_001",
        customer_id: "cus_001",
        status: "committed",
        confirmation_id: "conf_001",
        expected_state_version: 3,
        operations: [{
          type: "update_customization",
          field: "spice_level",
          previous_value: "normal",
          next_value: "spicy"
        }],
        source: { change_set_id: "cs_001", confirmation_id: "conf_001" }
      }],
      diffs: [{
        evidence_id: "diff_spice_1",
        created_at: now,
        change_set_id: "cs_001",
        customer_id: "cus_001",
        status: "committed",
        diff_kind: "customization",
        field: "spice_level",
        before: "normal",
        after: "spicy",
        can_describe_as_written: true,
        operation: {
          type: "update_customization",
          field: "spice_level",
          previous_value: "normal",
          next_value: "spicy"
        },
        source: { change_set_id: "cs_001" }
      }]
    });

    expect(parsed.transcript[0]?.is_operational_source).toBe(false);
    expect(parsed.diffs[0]?.can_describe_as_written).toBe(true);
  });

  it("validates blocked policy evidence without written diff authority", () => {
    const parsed = RealtimeEvidenceSnapshotSchema.parse({
      schema_version: REALTIME_EVIDENCE_SCHEMA_VERSION,
      call_id: "rtc_blocked_123456",
      run_id: "browser_rtc_blocked_123456",
      status: "active",
      generated_at: now,
      tools: [{
        evidence_id: "tool_commit_blocked",
        created_at: now,
        tool_call_id: "call_commit_1",
        tool_name: "commit_change_set",
        risk: "write",
        status: "blocked",
        tool_error: {
          code: "POLICY_BLOCKED",
          message: "Customization update requires a preview delta.",
          policy_id: PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA
        },
        audit_event_ids: ["aud_policy_block"],
        source: {
          audit_event_id: "aud_policy_block",
          policy_id: PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA,
          tool_call_id: "call_commit_1"
        }
      }],
      policies: [{
        evidence_id: "policy_customization_delta_block",
        created_at: now,
        policy_id: PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA,
        stage: "commit",
        result: {
          policy_id: PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA,
          severity: "block",
          passed: false,
          message: "Customization updates require previewed deltas."
        },
        source: {
          policy_id: PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA,
          tool_call_id: "call_commit_1"
        }
      }],
      change_sets: [{
        evidence_id: "cs_blocked",
        created_at: now,
        change_set_id: "cs_blocked_1",
        customer_id: "cus_001",
        status: "blocked",
        blocking_policy_ids: [PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA],
        operations: [{
          type: "update_customization",
          field: "spice_level",
          next_value: "extra_spicy"
        }],
        policy_results: [{
          policy_id: PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA,
          severity: "block",
          passed: false,
          message: "Customization updates require previewed deltas."
        }],
        source: { change_set_id: "cs_blocked_1" }
      }],
      diffs: [{
        evidence_id: "diff_blocked_spice",
        created_at: now,
        change_set_id: "cs_blocked_1",
        customer_id: "cus_001",
        status: "blocked",
        diff_kind: "customization",
        field: "spice_level",
        before: "normal",
        after: "extra_spicy",
        can_describe_as_written: false,
        operation: {
          type: "update_customization",
          field: "spice_level",
          next_value: "extra_spicy"
        },
        source: {
          change_set_id: "cs_blocked_1",
          policy_id: PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA
        }
      }]
    });

    expect(parsed.tools[0]?.status).toBe("blocked");
    expect(parsed.diffs[0]?.can_describe_as_written).toBe(false);
  });

  it("represents missing confirmation without fabricating a confirmation", () => {
    const parsed = RealtimeEvidenceSnapshotSchema.parse({
      schema_version: REALTIME_EVIDENCE_SCHEMA_VERSION,
      call_id: "rtc_missing_confirmation_123456",
      run_id: "browser_rtc_missing_confirmation_123456",
      status: "active",
      generated_at: now,
      confirmations: [{
        evidence_id: "conf_missing_1",
        created_at: now,
        status: "missing",
        change_set_id: "cs_waiting_1",
        customer_id: "cus_001",
        reason: "Preview was shown, but the caller has not explicitly confirmed.",
        source: { change_set_id: "cs_waiting_1", customer_id: "cus_001" }
      }],
      change_sets: [{
        evidence_id: "cs_waiting_1",
        created_at: now,
        change_set_id: "cs_waiting_1",
        customer_id: "cus_001",
        status: "previewed",
        operations: [{
          type: "create_payment_followup",
          reason: "failed_payment"
        }],
        source: { change_set_id: "cs_waiting_1" }
      }]
    });

    expect(parsed.confirmations[0]?.status).toBe("missing");
    expect(parsed.confirmations[0]).not.toHaveProperty("confirmation");
  });

  it("rejects committed ChangeSet evidence without server confirmation", () => {
    const result = RealtimeEvidenceSnapshotSchema.safeParse({
      schema_version: REALTIME_EVIDENCE_SCHEMA_VERSION,
      call_id: "rtc_missing_server_confirmation_123456",
      run_id: "browser_rtc_missing_server_confirmation_123456",
      status: "ended",
      generated_at: now,
      change_sets: [{
        evidence_id: "cs_committed_without_confirmation",
        created_at: now,
        change_set_id: "cs_committed_without_confirmation",
        customer_id: "cus_001",
        status: "committed",
        operations: [{
          type: "create_payment_followup",
          reason: "failed_payment"
        }],
        source: { change_set_id: "cs_committed_without_confirmation" }
      }]
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-committed diffs that claim a write happened", () => {
    const result = RealtimeEvidenceSnapshotSchema.safeParse({
      schema_version: REALTIME_EVIDENCE_SCHEMA_VERSION,
      call_id: "rtc_invalid_123456",
      run_id: "browser_rtc_invalid_123456",
      status: "ended",
      generated_at: now,
      change_sets: [{
        evidence_id: "cs_previewed",
        created_at: now,
        change_set_id: "cs_previewed_1",
        customer_id: "cus_001",
        status: "previewed",
        operations: [],
        source: { change_set_id: "cs_previewed_1" }
      }],
      diffs: [{
        evidence_id: "diff_invalid",
        created_at: now,
        change_set_id: "cs_previewed_1",
        customer_id: "cus_001",
        status: "proposed",
        diff_kind: "payment_followup",
        field: "payment_followup",
        can_describe_as_written: true,
        operation: { type: "create_payment_followup", reason: "failed_payment" },
        source: { change_set_id: "cs_previewed_1" }
      }]
    });

    expect(result.success).toBe(false);
  });
});
