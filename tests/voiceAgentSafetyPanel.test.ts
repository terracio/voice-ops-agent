import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  applyVoiceConsoleAction,
  createInitialVoiceConsoleState,
  VoiceConsoleView
} from "../src/features/voice-console";
import { toVoiceConsoleEvidenceState } from "../src/features/voice-console/evidence/voiceConsoleEvidence";

describe("voice agent safety panel", () => {
  it("shows connected no-identity blocking state", () => {
    const html = renderLiveCall();

    expect(html).toContain("Waiting for identifier");
    expect(html).toContain("No customer identified");
    expect(html).toContain("Private reads and writes blocked");
    expect(html).toContain("Identity policy active");
  });

  it("renders confirmed preview, compact tools, and policy blockers without raw JSON", () => {
    const html = renderLiveCall(safetyEvidence());

    expect(html).toContain("Confirmed: Maya Chen");
    expect(html).toContain("Customer ID");
    expect(html).toContain("cus_001");
    expect(html).toContain("Balanced Weekly");
    expect(html).toContain("Allergy risk");
    expect(html).toContain("Payment failed");
    expect(html).toContain("Waiting for confirmation");
    expect(html).toContain("Previewed");
    expect(html).toContain("Update Customization");
    expect(html).toContain("spice_level");
    expect(html).toContain("normal");
    expect(html).toContain("spicy");
    expect(html).toContain("cs_spice");
    expect(html).toContain("State v7");
    expect(html).toContain("Required before commit");
    expect(html).toContain("No state committed yet");
    expect(html).toContain("Blocked by P004_MISSING_CONFIRMATION");
    expect(html).toContain("Commit requires explicit confirmation.");
    expect(html).toContain("Policy P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA");
    expect(html).not.toContain("Input {");
    expect(html).not.toContain("Output {");
  });

  it("renders committed ChangeSets without preview-only copy", () => {
    const html = renderLiveCall(committedSafetyEvidence());

    expect(html).toContain("Committed");
    expect(html).toContain("Satisfied");
    expect(html).toContain("Committed after server confirmation and policy revalidation.");
    expect(html).not.toContain("Preview only");
    expect(html).not.toContain("No state committed yet");
  });
});

function renderLiveCall(evidence?: ReturnType<typeof toVoiceConsoleEvidenceState>) {
  const state = applyVoiceConsoleAction(
    createInitialVoiceConsoleState("10:51:24"),
    { type: "start", at: "10:52:00" }
  );
  return renderToStaticMarkup(
    React.createElement(VoiceConsoleView, {
      state,
      evidence,
      onAction: () => undefined
    })
  );
}

function safetyEvidence() {
  return toVoiceConsoleEvidenceState({
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
    tools: [
      confirmedIdentityTool(),
      customerStateTool(),
      paymentStatusTool(),
      blockedCommitTool()
    ]
  });
}

function committedSafetyEvidence() {
  return toVoiceConsoleEvidenceState({
    change_sets: [{
      blocking_policy_ids: [],
      change_set_id: "cs_spice",
      confirmation_id: "conf_spice",
      created_at: "2026-05-18T09:00:08.000Z",
      customer_id: "cus_001",
      expected_state_version: 7,
      operations: [{
        field: "spice_level",
        next_value: "spicy",
        previous_value: "normal",
        type: "update_customization"
      }],
      policy_results: [],
      status: "committed"
    }],
    diffs: [{
      after: "spicy",
      before: "normal",
      change_set_id: "cs_spice",
      created_at: "2026-05-18T09:00:08.000Z",
      customer_id: "cus_001",
      diff_kind: "customization",
      field: "spice_level",
      status: "written"
    }],
    tools: [confirmedIdentityTool(), customerStateTool()]
  });
}

function confirmedIdentityTool() {
  return {
    created_at: "2026-05-18T09:00:01.000Z",
    evidence_id: "tool_confirm",
    output: {
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
  };
}

function customerStateTool() {
  return {
    created_at: "2026-05-18T09:00:02.000Z",
    evidence_id: "tool_state",
    output: {
      data: {
        customer: {
          allergies: ["peanut"],
          customer_id: "cus_001",
          name: "Maya Chen",
          state_version: 7
        },
        plan: { plan_name: "Balanced Weekly" }
      },
      ok: true
    },
    result_summary: "Customer state read.",
    risk: "read",
    status: "ok",
    tool_call_id: "call_state",
    tool_name: "get_customer_state"
  };
}

function paymentStatusTool() {
  return {
    created_at: "2026-05-18T09:00:03.000Z",
    evidence_id: "tool_payment",
    output: {
      data: { payment_status: "failed" },
      ok: true
    },
    result_summary: "Payment status read.",
    risk: "read",
    status: "ok",
    tool_call_id: "call_payment",
    tool_name: "get_payment_status"
  };
}

function blockedCommitTool() {
  return {
    created_at: "2026-05-18T09:00:05.000Z",
    evidence_id: "tool_blocked",
    result_summary: "Customization update requires a preview delta.",
    risk: "write",
    status: "blocked",
    tool_call_id: "call_blocked",
    tool_error: {
      code: "POLICY_BLOCK",
      message: "Customization update requires a preview delta.",
      policy_id: "P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA"
    },
    tool_name: "commit_change_set"
  };
}
