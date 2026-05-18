import { describe, expect, it } from "vitest";
import {
  applyVoiceConsoleAction,
  createInitialVoiceConsoleState
} from "../src/features/voice-console";
import { toVoiceConsoleEvidenceState } from "../src/features/voice-console/evidence/voiceConsoleEvidence";
import { buildPrototypeLiveCallViewModel } from "../src/features/voice-console/models/liveCallViewModel";
import {
  markRealtimeCallId,
  markRealtimeState,
  markRealtimeStartRequested
} from "../src/features/voice-console/state/voiceConsoleRealtimeState";

describe("live call view model", () => {
  it("renders initial metrics without customer or tool evidence", () => {
    const state = createInitialVoiceConsoleState("10:00:00");
    const model = buildPrototypeLiveCallViewModel({ state });

    expect(model.connection.status).toBe("disconnected");
    expect(model.elapsedLabel).toBe("00:00");
    expect(model.cost).toMatchObject({ isAvailable: false, label: "--" });
    expect(model.customer.status).toBe("unknown");
    expect(model.customer.name).toBe("No caller identified yet");
    expect(model.actionBanner.title).toBe("Ready");
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

    expect(buildPrototypeLiveCallViewModel({ state: ticked }).elapsedLabel).toBe("00:30");
    expect(buildPrototypeLiveCallViewModel({ state: stopped }).elapsedLabel).toBe("01:00");
    expect(buildPrototypeLiveCallViewModel({ state: laterTick }).elapsedLabel).toBe("01:00");
    expect(buildPrototypeLiveCallViewModel({ state: stopped }).connection.status).toBe("ended");

    const reset = applyVoiceConsoleAction(stopped, {
      type: "reset",
      at: "10:03:00"
    });
    expect(buildPrototypeLiveCallViewModel({ state: reset }).elapsedLabel).toBe("00:00");
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
    const model = buildPrototypeLiveCallViewModel({ state: ticked });

    expect(model.connection.status).toBe("connected");
    expect(model.elapsedLabel).toBe("00:30");
    expect(model.customer.status).toBe("unknown");
    expect(model.policy.statusText).toContain("Private reads and writes");
    expect(model.actionBanner.title).toBe("Waiting for identifier");
  });

  it("keeps uncertain lookup candidates out of pending confirmation state", () => {
    const state = createInitialVoiceConsoleState("10:00:00");
    const evidence = toVoiceConsoleEvidenceState({
      tools: [{
        created_at: "2026-05-18T09:00:01.000Z",
        evidence_id: "tool_lookup",
        output: {
          audit_event_ids: ["audit_lookup"],
          data: {
            candidate_count: 2,
            candidates: [{
              customer_id: "cus_001",
              identity_confidence: "confirmed",
              name: "Maya Chen",
              phone_last4: "0101"
            }, {
              customer_id: "cus_101",
              identity_confidence: "uncertain",
              name: "Maya Chandra",
              phone_last4: "2222"
            }],
            identity_status: "uncertain",
            policy_ids: ["P001_IDENTITY_UNCERTAIN"],
            write_blocked: true
          },
          ok: true
        },
        result_summary: "Multiple possible customers found.",
        risk: "read",
        status: "ok",
        tool_call_id: "call_lookup",
        tool_name: "lookup_customer"
      }]
    });
    const model = buildPrototypeLiveCallViewModel({ evidence, state });

    expect(model.customer.status).toBe("uncertain");
    expect(model.customer.name).toBe("Maya Chen");
    expect(model.agentAudioStatus.callerPhone).toBe("Phone ending 0101");
    expect(model.agentAudioStatus.callerPhone).not.toContain("+1 (415) 555");
    expect(model.policy.statusText).toContain("Private reads and writes");
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
    const model = buildPrototypeLiveCallViewModel({ evidence, state });

    expect(model.customer).toMatchObject({
      name: "Maya Chen",
      plan: "Balanced Weekly",
      status: "confirmed"
    });
    expect(model.customer.riskFlags).toContainEqual({ label: "Allergy", status: "warning" });
    expect(model.changeSet).toMatchObject({
      changeSetId: "cs_spice",
      operationType: "Update customization",
      requiresConfirmation: true,
      stateVersion: "7 -> 8 pending"
    });
    expect(model.changeSet).toMatchObject({ afterState: "spicy", beforeState: "normal" });
    expect(model.policy.statusText).toBe("Blocked by P004_MISSING_CONFIRMATION");
    expect(model.tools.map((tool) => tool.name)).toContain("preview_change_set");
    expect(model.speech.caller.text).toBe("Please make next week spicy.");
    expect(model.speech.agent.text).toBe("I can preview that change.");
  });

  it("does not report stale historical policy blockers after commit", () => {
    const state = createInitialVoiceConsoleState("10:00:00");
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
      }],
      policies: [{
        created_at: "2026-05-18T09:00:05.000Z",
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
      }]
    });
    const model = buildPrototypeLiveCallViewModel({ evidence, state });

    expect(model.changeSet).toMatchObject({
      changeSetId: "cs_spice",
      isActive: false,
      requiresConfirmation: false
    });
    expect(model.policy.statusText).toBe("No deterministic policy blockers in current evidence.");
    expect(model.policy.statusText).not.toContain("P004_MISSING_CONFIRMATION");
  });
});
