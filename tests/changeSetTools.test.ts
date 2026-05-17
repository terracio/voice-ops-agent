import { beforeEach, describe, expect, it } from "vitest";
import * as db from "../src/domain/db";
import { resolveServiceDates } from "../src/domain/dateResolver";
import { PolicyId, type ChangeSet, type Confirmation, type ToolResult } from "../src/domain/schema";
import type { PreviewChangeSetToolOutput, ValidateChangeSetToolOutput } from "../src/tools/changeSetToolSchemas";
import { changeSetTools } from "../src/tools/changeSetTools";
import { createToolRegistry, type ToolExecutionContext } from "../src/tools";

const CREATED_AT = "2026-05-11T10:00:00Z";
const PREVIEWED_AT = "2026-05-11T10:01:00Z";
const CONFIRMED_AT = "2026-05-11T10:02:00Z";
const COMMITTED_AT = "2026-05-11T10:03:00Z";

beforeEach(() => db.resetDb());

function context(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    run_id: "run_change_set_tools",
    session_id: "session_debug",
    actor: "agent",
    current_user_turn_id: "turn_001",
    last_user_message: "Please pause Monday.",
    identity_status: "confirmed",
    resolved_customer_id: "cus_001",
    trusted_date_resolutions: [
      resolveServiceDates({
        customer_id: "cus_001",
        phrase: "Pause Monday.",
        requested_days: ["Monday"]
      })
    ],
    current_time: CREATED_AT,
    reference_time: CREATED_AT,
    ...overrides
  };
}

function expectData<T>(result: ToolResult<unknown>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data as T;
}

describe("changeSetTools", () => {
  it("exports the ChangeSet tool collection with risk metadata", () => {
    expect(changeSetTools.map((tool) => [tool.name, tool.risk])).toEqual([
      ["create_change_set", "preview"],
      ["validate_change_set", "preview"],
      ["preview_change_set", "preview"],
      ["capture_confirmation", "write"],
      ["commit_change_set", "write"]
    ]);
  });

  it("runs the full preview, confirmation, and commit boundary", async () => {
    const registry = createToolRegistry(changeSetTools);

    const created = expectData<ChangeSet>(
      await registry.execute("create_change_set", {
        modelArgs: {
          change_set_id: "cs_tool_happy",
          operations: [
            { type: "pause_dates", dates: ["2026-05-18"], reason: "travel" },
            { type: "update_customization", field: "spice_level", next_value: "spicy" }
          ],
          ttl_minutes: 30
        },
        context: context({ current_time: CREATED_AT })
      })
    );

    expect(created.customer_id).toBe("cus_001");
    expect(created.created_at).toBe(CREATED_AT);
    expect(created.operations[1]).toMatchObject({
      field: "spice_level",
      previous_value: "normal"
    });

    const validation = expectData<ValidateChangeSetToolOutput>(
      await registry.execute("validate_change_set", {
        modelArgs: { change_set_id: created.change_set_id },
        context: context({ current_time: PREVIEWED_AT })
      })
    );
    expect(validation).toMatchObject({
      change_set_id: created.change_set_id,
      allowed_to_preview: true,
      allowed_to_commit: false,
      requires_confirmation: true,
      requires_escalation: false
    });

    const preview = expectData<PreviewChangeSetToolOutput>(
      await registry.execute("preview_change_set", {
        modelArgs: { change_set_id: created.change_set_id },
        context: context({ current_time: PREVIEWED_AT })
      })
    );
    expect(preview.customization_deltas).toEqual([{
      operation_index: 1,
      field: "spice_level",
      before: "normal",
      after: "spicy"
    }]);
    expect(preview.non_actionable_items).toEqual([]);
    expect(preview.requires_confirmation).toBe(true);
    expect(db.listKitchenExportDeltas("cus_001")).toHaveLength(0);

    const confirmation = expectData<Confirmation>(
      await registry.execute("capture_confirmation", {
        modelArgs: {
          change_set_id: created.change_set_id
        },
        context: context({
          current_time: CONFIRMED_AT,
          current_user_turn_id: "turn_confirm",
          last_user_message: "Yes, confirm those changes."
        })
      })
    );
    expect(confirmation.confirmation_id).toMatch(/^conf_/);
    expect(confirmation).toMatchObject({
      run_id: "run_change_set_tools",
      customer_id: "cus_001",
      source_user_turn_id: "turn_confirm",
      captured_by: "server",
      confirmed_by: "user",
      transcript_excerpt: "Yes, confirm those changes."
    });

    const committed = expectData<ChangeSet>(
      await registry.execute("commit_change_set", {
        modelArgs: {
          change_set_id: created.change_set_id,
          confirmation_id: confirmation.confirmation_id
        },
        context: context({ current_time: COMMITTED_AT })
      })
    );

    expect(committed.status).toBe("committed");
    expect(db.getCustomer("cus_001")?.state_version).toBe(13);
    expect(
      db
        .getCustomerState("cus_001")
        ?.service_dates.find((date) => date.service_date === "2026-05-18")
        ?.status
    ).toBe("paused");
    expect(db.listKitchenExportDeltas("cus_001")).toHaveLength(1);
    expect(
      db
        .getAuditEventsByRunId("run_change_set_tools")
        .map((event) => event.tool_name)
    ).toEqual([
      "create_change_set",
      "preview_change_set",
      "capture_confirmation",
      "commit_change_set",
      "materialize_kitchen_delta"
    ]);
  });

  it("injects context and rejects model-supplied customer or run identity", async () => {
    const registry = createToolRegistry(changeSetTools);
    const operation = { type: "pause_dates", dates: ["2026-05-18"], reason: "travel" };

    await expect(
      registry.execute("create_change_set", {
        modelArgs: { customer_id: "cus_001", operations: [operation] },
        context: context()
      })
    ).resolves.toMatchObject({ ok: false, error: { code: "TOOL_INVALID_ARGS" } });

    await expect(
      registry.execute("create_change_set", {
        modelArgs: { run_id: "run_from_model", operations: [operation] },
        context: context()
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_CONTEXT_OVERRIDE_FORBIDDEN" }
    });

    await expect(
      registry.execute("create_change_set", {
        modelArgs: { operations: [operation] },
        context: context({ identity_status: "unknown", resolved_customer_id: undefined })
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "TOOL_IDENTITY_UNRESOLVED",
        policy_id: PolicyId.IDENTITY_UNCERTAIN
      }
    });
  });

  it("blocks invalid confirmation capture and raw commit confirmation", async () => {
    const registry = createToolRegistry(changeSetTools);
    const missingPreview = expectData<ChangeSet>(
      await registry.execute("create_change_set", {
        modelArgs: {
          change_set_id: "cs_missing_preview",
          operations: [{ type: "pause_dates", dates: ["2026-05-18"] }]
        },
        context: context({ current_time: CREATED_AT })
      })
    );

    await expect(
      registry.execute("commit_change_set", {
        modelArgs: {
          change_set_id: missingPreview.change_set_id,
          confirmation_id: "conf_missing_preview"
        },
        context: context({ current_time: COMMITTED_AT })
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { policy_id: PolicyId.MISSING_PREVIEW }
    });

    const createResult = await registry.execute("create_change_set", {
      modelArgs: {
        change_set_id: "cs_confirmation_boundary",
        operations: [{ type: "pause_dates", dates: ["2026-05-18"] }]
      },
      context: context({ current_time: CREATED_AT })
    });
    const changeSet = expectData<ChangeSet>(createResult);

    await expect(
      registry.execute("preview_change_set", {
        modelArgs: { change_set_id: changeSet.change_set_id },
        context: context({ current_time: PREVIEWED_AT })
      })
    ).resolves.toMatchObject({ ok: true });

    await expect(
      registry.execute("capture_confirmation", {
        modelArgs: { change_set_id: changeSet.change_set_id },
        context: context({
          current_time: CONFIRMED_AT,
          last_user_message: "Maybe, let me think."
        })
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_NOT_EXPLICIT" }
    });
    await expect(
      registry.execute("capture_confirmation", {
        modelArgs: { change_set_id: changeSet.change_set_id, confirmation_id: "conf_from_model" },
        context: context({ current_time: CONFIRMED_AT, last_user_message: "Yes, confirm it." })
      })
    ).resolves.toMatchObject({ ok: false, error: { code: "TOOL_INVALID_ARGS" } });

    await expect(
      registry.execute("commit_change_set", {
        modelArgs: {
          change_set_id: changeSet.change_set_id,
          confirmation_id: "conf_missing"
        },
        context: context({ current_time: COMMITTED_AT })
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { policy_id: PolicyId.MISSING_CONFIRMATION }
    });

    await expect(
      registry.execute("commit_change_set", {
        modelArgs: {
          change_set_id: changeSet.change_set_id,
          confirmation: { transcript_excerpt: "Yes" }
        },
        context: context({ current_time: COMMITTED_AT })
      })
    ).resolves.toMatchObject({ ok: false, error: { code: "TOOL_INVALID_ARGS" } });
  });

  it("covers hard blocked paths through tool wrappers", async () => {
    const registry = createToolRegistry(changeSetTools);
    const ambiguousResolution = resolveServiceDates({
      customer_id: "cus_001",
      phrase: "sometime next week"
    });
    await expect(
      registry.execute("create_change_set", {
        modelArgs: {
          change_set_id: "cs_blocked_paths",
          operations: [{ type: "pause_dates", dates: ["2026-05-18"] }],
          date_resolution: ambiguousResolution,
          ttl_minutes: 1
        },
        context: context({
          current_time: CREATED_AT,
          trusted_date_resolutions: [ambiguousResolution]
        })
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { policy_id: PolicyId.AMBIGUOUS_DATE }
    });

    const paymentFollowup = expectData<ChangeSet>(
      await registry.execute("create_change_set", {
        modelArgs: {
          change_set_id: "cs_payment_followup_tool",
          operations: [{ type: "create_payment_followup", reason: "failed_payment" }]
        },
        context: context({ current_time: CREATED_AT })
      })
    );
    expect(paymentFollowup.operations[0]).toMatchObject({
      type: "create_payment_followup",
      reason: "failed_payment"
    });

    await expect(
      registry.execute("create_change_set", {
        modelArgs: {
          operations: [{ type: "create_kitchen_export_delta", dates: ["2026-05-18"] }]
        },
        context: context()
      })
    ).resolves.toMatchObject({ ok: false, error: { code: "TOOL_INVALID_ARGS" } });
  });
});
