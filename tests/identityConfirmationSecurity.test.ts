import { beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents, resetDb } from "../src/domain/db";
import {
  applyRealtimeToolResultToSessionState,
  applyRealtimeTranscriptEventToSessionState,
  buildRealtimeToolContext,
  createRealtimeSessionState,
  createRealtimeToolContextBase
} from "../src/realtime/server/sessionState";
import { createMealPlanToolRegistry } from "../src/tools";

describe("identity confirmation security", () => {
  beforeEach(() => resetDb());

  it("does not authorize private reads from lookup alone", async () => {
    const harness = createIdentityHarness();

    await expect(harness.invoke("get_customer_state", {}))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "IDENTITY_NOT_RESOLVED" }
      });

    await expect(harness.invoke("lookup_customer", { customer_id: "CUS_001" }))
      .resolves.toMatchObject({
        ok: true,
        data: { identity_status: "confirmed", candidate_count: 1 }
      });
    expect(harness.state).toMatchObject({
      identity_status: "uncertain",
      pending_identity_candidate: { customer_id: "cus_001" }
    });

    await expect(harness.invoke("get_customer_state", {}))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "IDENTITY_NOT_RESOLVED" }
      });
  });

  it("requires an explicit later user turn before identity becomes confirmed", async () => {
    const harness = createIdentityHarness();

    await harness.invoke("lookup_customer", { customer_id: "CUS_001" });
    await expect(harness.invoke("confirm_customer_identity", { customer_id: "CUS_001" }))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "IDENTITY_CONFIRMATION_NOT_EXPLICIT" }
      });

    harness.userTurn("turn_identity_action", "Go ahead.");
    await expect(harness.invoke("confirm_customer_identity", { customer_id: "CUS_001" }))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "IDENTITY_CONFIRMATION_NOT_EXPLICIT" }
      });

    harness.userTurn("turn_identity_bare_yes", "Yes.");
    await expect(harness.invoke("confirm_customer_identity", { customer_id: "CUS_001" }))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "IDENTITY_CONFIRMATION_NOT_EXPLICIT" }
      });

    harness.userTurn("turn_identity_confirm", "Yes, that's me.");
    await expect(harness.invoke("confirm_customer_identity", { customer_id: "CUS_001" }))
      .resolves.toMatchObject({
        ok: true,
        data: {
          customer_id: "cus_001",
          identity_status: "confirmed",
          response_guidance:
            "Acknowledge naturally that verification is complete for Maya, then ask how you can help with the subscription update."
        }
      });
    expect([...listAuditEvents()].reverse().find(
      (event) => event.tool_name === "confirm_customer_identity" &&
        event.event_type === "read"
    )).toMatchObject({
      details: {
        identity_confirmation_intent: { intent: "confirm_self" }
      }
    });

    await expect(harness.invoke("get_customer_state", {}))
      .resolves.toMatchObject({
        ok: true,
        data: { customer: { customer_id: "cus_001" } }
      });
  });

  it("accepts explicit candidate-name confirmation despite repeated realtime fragments", async () => {
    const harness = createIdentityHarness();

    await harness.invoke("lookup_customer", { customer_id: "CUS_001" });
    harness.userTurn(
      "turn_identity_named_confirm",
      "confirm am Maya I confirm I am Maya."
    );

    await expect(harness.invoke("confirm_customer_identity", { customer_id: "CUS_001" }))
      .resolves.toMatchObject({
        ok: true,
        data: { customer_id: "cus_001", identity_status: "confirmed" }
      });
  });

  it("rejects negated candidate-name confirmation", async () => {
    const harness = createIdentityHarness();

    await harness.invoke("lookup_customer", { customer_id: "CUS_001" });
    harness.userTurn("turn_identity_negated", "No, I am not Maya.");

    await expect(harness.invoke("confirm_customer_identity", { customer_id: "CUS_001" }))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "IDENTITY_CONFIRMATION_NOT_EXPLICIT" }
      });
  });

  it.each([
    "I am Maya's husband.",
    "This is Maya's friend.",
    "I am Maya's assistant calling for her."
  ])("rejects third-party identity confirmation: %s", async (transcript) => {
    const harness = createIdentityHarness();

    await harness.invoke("lookup_customer", { customer_id: "CUS_001" });
    harness.userTurn("turn_identity_third_party", transcript);

    await expect(harness.invoke("confirm_customer_identity", { customer_id: "CUS_001" }))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "IDENTITY_CONFIRMATION_NOT_EXPLICIT" }
      });
    expect([...listAuditEvents()].reverse().find(
      (event) => event.tool_name === "confirm_customer_identity" &&
        event.event_type === "policy_block"
    )).toMatchObject({
      details: {
        identity_confirmation_intent: { intent: "third_party" },
        same_turn_confirmation: false
      }
    });
    expect(harness.state).toMatchObject({
      identity_status: "uncertain",
      resolved_customer_id: undefined,
      pending_identity_candidate: { customer_id: "cus_001" }
    });
    await expect(harness.invoke("get_customer_state", {}))
      .resolves.toMatchObject({
        ok: false,
        error: { code: "IDENTITY_NOT_RESOLVED" }
      });
  });
});

function createIdentityHarness() {
  const registry = createMealPlanToolRegistry();
  const state = createRealtimeSessionState();
  const base = createRealtimeToolContextBase({
    lastUserMessage: "My customer ID is CUS_001.",
    now: () => new Date("2026-05-13T09:00:00+02:00"),
    runId: "run_identity_confirmation_security",
    sessionId: "session_identity_confirmation_security",
    userTurnId: "turn_lookup"
  });

  return {
    state,
    invoke: async (toolName: string, args: unknown) => {
      const context = buildRealtimeToolContext({ base, state });
      const result = await registry.execute(toolName, { modelArgs: args, context });
      applyRealtimeToolResultToSessionState({ result, state, toolContext: context, toolName });
      return result;
    },
    userTurn: (turnId: string, transcript: string) => {
      applyRealtimeTranscriptEventToSessionState({
        event: {
          item_id: turnId,
          transcript,
          type: "conversation.item.input_audio_transcription.completed"
        },
        fallbackTurnId: "fallback_turn",
        now: () => new Date("2026-05-13T09:01:00+02:00"),
        state
      });
    }
  };
}
