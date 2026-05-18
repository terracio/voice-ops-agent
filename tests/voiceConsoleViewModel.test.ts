import { describe, expect, it } from "vitest";
import {
  applyVoiceConsoleAction,
  buildLiveCallViewModel,
  createInitialVoiceConsoleState
} from "../src/features/voice-console";
import { toVoiceConsoleEvidenceState } from "../src/features/voice-console/evidence/voiceConsoleEvidence";
import {
  markRealtimeCallId,
  markRealtimeState,
  markRealtimeStartRequested
} from "../src/features/voice-console/state/voiceConsoleRealtimeState";

describe("live call view model", () => {
  it("renders initial metrics without customer or tool evidence", () => {
    const state = createInitialVoiceConsoleState("10:00:00");
    const model = buildLiveCallViewModel({ state });

    expect(model.connection).toMatchObject({ label: "Ready", state: "ready" });
    expect(model.elapsedLabel).toBe("00:00");
    expect(model.cost).toMatchObject({ label: "$0.00" });
    expect(model.customer.identityStatus).toBe("unknown");
    expect(model.customer.summaryLabel).toBe("No customer identified");
    expect(model.tools).toEqual([]);
    expect(model.speech.caller.text).toBe("");
    expect(model.speech.agent.text).toBe("");
  });

  it("tracks active and ended elapsed time in console state", () => {
    const initial = createInitialVoiceConsoleState("10:00:00");
    const started = applyVoiceConsoleAction(initial, {
      type: "start",
      at: "10:00:05"
    });
    const ticked = applyVoiceConsoleAction(started, {
      type: "tick",
      at: "10:00:35"
    });
    const stopped = applyVoiceConsoleAction(ticked, {
      type: "stop",
      at: "10:01:05"
    });
    const laterTick = applyVoiceConsoleAction(stopped, {
      type: "tick",
      at: "10:02:05"
    });

    expect(buildLiveCallViewModel({ state: ticked }).elapsedLabel).toBe("00:30");
    expect(buildLiveCallViewModel({ state: stopped }).elapsedLabel).toBe("01:00");
    expect(buildLiveCallViewModel({ state: laterTick }).elapsedLabel).toBe("01:00");
    expect(buildLiveCallViewModel({ state: stopped }).connection.state).toBe("ended");

    const reset = applyVoiceConsoleAction(stopped, {
      type: "reset",
      at: "10:03:00"
    });
    expect(buildLiveCallViewModel({ state: reset }).elapsedLabel).toBe("00:00");
  });

  it("shows active timing and identity policy for connected calls without identity", () => {
    const connecting = markRealtimeStartRequested(
      createInitialVoiceConsoleState("10:00:00"),
      "10:00:05",
      5_000
    );
    const callCreated = markRealtimeCallId(connecting, "rtc_test_123456", "10:00:06");
    const connected = markRealtimeState(callCreated, {
      at: "10:00:10",
      nowMs: 10_000,
      previousState: "connecting",
      state: "listening"
    });
    const ticked = applyVoiceConsoleAction(connected, {
      type: "tick",
      at: "10:00:40",
      nowMs: 40_000
    });
    const model = buildLiveCallViewModel({ state: ticked });

    expect(model.connection.state).toBe("connected");
    expect(model.elapsedLabel).toBe("00:30");
    expect(model.customer.identityStatus).toBe("unknown");
    expect(model.policy.label).toBe("Identity policy active");
    expect(model.policy.detail).toContain("Private reads and writes");
    expect(model.actionBanner.label).toBe("Waiting for identifier");
  });

  it("derives customer, ChangeSet, tool, and policy summaries from structured evidence", () => {
    const state = applyVoiceConsoleAction(createInitialVoiceConsoleState("10:00:00"), {
      type: "start",
      at: "10:00:00"
    });
    const evidence = toVoiceConsoleEvidenceState({
      change_sets: [{
        blocking_policy_ids: ["P004_MISSING_CONFIRMATION"],
        change_set_id: "cs_spice",
        created_at: "2026-05-18T09:00:04.000Z",
        customer_id: "cus_001",
        expected_state_version: 7,
        operations: [{
          field: "spice_level",
          next_value: "spicy",
          previous_value: "normal",
          type: "update_customization"
        }],
        policy_results: [{
          message: "Commit requires explicit confirmation.",
          passed: false,
          policy_id: "P004_MISSING_CONFIRMATION",
          severity: "block"
        }],
        status: "previewed"
      }],
      diffs: [{
        after: "spicy",
        before: "normal",
        change_set_id: "cs_spice",
        created_at: "2026-05-18T09:00:04.000Z",
        customer_id: "cus_001",
        diff_kind: "customization",
        field: "spice_level",
        status: "proposed"
      }],
      policies: [{
        created_at: "2026-05-18T09:00:04.000Z",
        evidence_id: "policy_missing_confirmation",
        policy_id: "P004_MISSING_CONFIRMATION",
        result: {
          message: "Commit requires explicit confirmation.",
          passed: false,
          policy_id: "P004_MISSING_CONFIRMATION",
          severity: "block"
        },
        stage: "commit"
      }],
      tools: [{
        created_at: "2026-05-18T09:00:01.000Z",
        evidence_id: "tool_confirm",
        output: {
          audit_event_ids: ["audit_confirm"],
          data: {
            customer_id: "cus_001",
            identity_status: "confirmed",
            name: "Maya Chen",
            phone_last4: "0101"
          },
          ok: true
        },
        result_summary: "Identity confirmed.",
        risk: "read",
        status: "ok",
        tool_call_id: "call_confirm",
        tool_name: "confirm_customer_identity"
      }, {
        created_at: "2026-05-18T09:00:02.000Z",
        evidence_id: "tool_state",
        output: {
          audit_event_ids: ["audit_state"],
          data: {
            customer: {
              allergies: ["peanut"],
              customer_id: "cus_001",
              name: "Maya Chen",
              state_version: 7
            },
            plan: {
              plan_name: "Balanced Weekly"
            }
          },
          ok: true
        },
        result_summary: "Customer state read.",
        risk: "read",
        status: "ok",
        tool_call_id: "call_state",
        tool_name: "get_customer_state"
      }, {
        created_at: "2026-05-18T09:00:03.000Z",
        evidence_id: "tool_preview",
        output: { audit_event_ids: ["audit_preview"], data: {}, ok: true },
        result_summary: "Preview generated.",
        risk: "preview",
        status: "ok",
        tool_call_id: "call_preview",
        tool_name: "preview_change_set"
      }],
      transcript: [{
        actor: "user",
        created_at: "2026-05-18T09:00:00.000Z",
        evidence_id: "tr_user",
        is_operational_source: false,
        text: "Please make next week spicy.",
        transcript_kind: "realtime_transcript",
        turn_id: "turn_user"
      }, {
        actor: "assistant",
        created_at: "2026-05-18T09:00:01.000Z",
        evidence_id: "tr_agent",
        is_operational_source: false,
        text: "I can preview that change.",
        transcript_kind: "realtime_transcript",
        turn_id: "turn_agent"
      }]
    });
    const model = buildLiveCallViewModel({ evidence, state });

    expect(model.customer).toMatchObject({
      identityStatus: "confirmed",
      name: "Maya Chen",
      plan: "Balanced Weekly"
    });
    expect(model.customer.riskFlags).toContain("Allergy risk");
    expect(model.changeSet).toMatchObject({
      changeSetId: "cs_spice",
      confirmationRequired: true,
      operationLabel: "Update Customization",
      stateVersionLabel: "State v7",
      statusLabel: "Previewed"
    });
    expect(model.changeSet?.diffRows).toEqual([{
      after: "spicy",
      before: "normal",
      field: "spice_level"
    }]);
    expect(model.policy.label).toBe("Blocked by P004_MISSING_CONFIRMATION");
    expect(model.tools.map((tool) => tool.name)).toContain("preview_change_set");
    expect(model.speech.caller.text).toBe("Please make next week spicy.");
    expect(model.speech.agent.text).toBe("I can preview that change.");
  });
});
