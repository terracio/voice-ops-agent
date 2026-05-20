import { describe, expect, it } from "vitest";
import { toVoiceConsoleEvidenceState } from "../src/features/voice-console/evidence/voiceConsoleEvidence";
import { buildPrototypeLiveCallViewModel } from "../src/features/voice-console/models/liveCallViewModel";
import { visibleChangeSet } from "../src/features/voice-console/state/voiceConsoleChangeSetStatus";
import { createInitialVoiceConsoleState } from "../src/features/voice-console";

describe("voice console ChangeSet status selection", () => {
  it("keeps active blockers visible when later inserted ChangeSets are committed", () => {
    const evidence = toVoiceConsoleEvidenceState({
      change_sets: [{
        blocking_policy_ids: ["P009_LOCKED_SERVICE_DATE"],
        change_set_id: "cs_locked_date",
        created_at: "2026-05-18T09:00:12.000Z",
        customer_id: "cus_001",
        expected_state_version: 7,
        operations: [{ dates: ["2026-05-20"], type: "pause_dates" }],
        policy_results: [{
          message: "Locked service dates cannot be modified.",
          passed: false,
          policy_id: "P009_LOCKED_SERVICE_DATE",
          severity: "block"
        }],
        status: "blocked"
      }, {
        blocking_policy_ids: [],
        change_set_id: "cs_completed_spice",
        confirmation_id: "conf_completed_spice",
        created_at: "2026-05-18T09:00:10.000Z",
        customer_id: "cus_001",
        expected_state_version: 7,
        operations: [{ field: "spice_level", next_value: "spicy", type: "update_customization" }],
        policy_results: [],
        status: "committed"
      }],
      tools: [{
        created_at: "2026-05-18T09:00:01.000Z",
        evidence_id: "tool_confirm",
        output: {
          audit_event_ids: ["audit_confirm"],
          data: {
            customer_id: "cus_001",
            identity_status: "confirmed",
            name: "Maya Chen"
          },
          ok: true
        },
        result_summary: "Identity confirmed.",
        risk: "read",
        status: "ok",
        tool_call_id: "call_confirm",
        tool_name: "confirm_customer_identity"
      }]
    });

    const model = buildPrototypeLiveCallViewModel({
      evidence,
      state: createInitialVoiceConsoleState("10:00:00")
    });

    expect(visibleChangeSet(evidence.changeSets ?? [])?.changeSetId).toBe("cs_locked_date");
    expect(model.changeSet?.changeSetId).toBe("cs_locked_date");
    expect(model.policy.statusText).toBe("Blocked by P009_LOCKED_SERVICE_DATE");
    expect(model.actionBanner).toMatchObject({
      title: "Blocked by P009_LOCKED_SERVICE_DATE",
      type: "blocked"
    });
  });

  it("does not revive stale blockers after the same ChangeSet is committed", () => {
    const evidence = toVoiceConsoleEvidenceState({
      change_sets: [{
        blocking_policy_ids: ["P004_MISSING_CONFIRMATION"],
        change_set_id: "cs_spice",
        created_at: "2026-05-18T09:00:04.000Z",
        customer_id: "cus_001",
        expected_state_version: 7,
        operations: [{ field: "spice_level", next_value: "spicy", type: "update_customization" }],
        policy_results: [{
          message: "Commit requires explicit confirmation.",
          passed: false,
          policy_id: "P004_MISSING_CONFIRMATION",
          severity: "block"
        }],
        status: "previewed"
      }, {
        blocking_policy_ids: [],
        change_set_id: "cs_spice",
        confirmation_id: "conf_spice",
        created_at: "2026-05-18T09:00:08.000Z",
        customer_id: "cus_001",
        expected_state_version: 7,
        operations: [{ field: "spice_level", next_value: "spicy", type: "update_customization" }],
        policy_results: [],
        status: "committed"
      }]
    });

    expect(visibleChangeSet(evidence.changeSets ?? [])).toMatchObject({
      changeSetId: "cs_spice",
      status: "committed"
    });
  });
});
