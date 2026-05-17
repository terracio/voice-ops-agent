import { beforeEach, describe, expect, it } from "vitest";
import * as db from "../src/domain/db";
import { type ChangeSet } from "../src/domain/schema";
import {
  createMealPlanToolRegistry,
  mealPlanModelTools,
  type ToolExecutionContext
} from "../src/tools";

const context: ToolExecutionContext = {
  run_id: "run_mealplan_registry",
  session_id: "session_debug",
  actor: "agent",
  current_user_turn_id: "turn_001",
  last_user_message: "Please follow up on the failed payment.",
  identity_status: "confirmed",
  resolved_customer_id: "cus_001",
  current_time: "2026-05-11T10:00:00Z",
  reference_time: "2026-05-11T10:00:00Z"
};

beforeEach(() => db.resetDb());

describe("MealPlan model-facing registry", () => {
  it("contains read tools, ChangeSet tools, and escalation only", () => {
    expect(mealPlanModelTools.map((tool) => tool.name)).toEqual([
      "lookup_customer",
      "confirm_customer_identity",
      "get_customer_state",
      "resolve_service_dates",
      "get_payment_status",
      "create_change_set",
      "validate_change_set",
      "preview_change_set",
      "capture_confirmation",
      "commit_change_set",
      "escalate_to_human"
    ]);
  });

  it("excludes internal side-effect tools from the model-facing registry", () => {
    const registry = createMealPlanToolRegistry();
    const names = registry.list().map((tool) => tool.name);

    expect(names).not.toContain("create_kitchen_export_delta");
    expect(names).not.toContain("materialize_kitchen_delta");
    expect(names).not.toContain("materialize_payment_followup");
    expect(names).not.toContain("create_payment_followup");
    expect(registry.get("create_kitchen_export_delta")).toBeUndefined();
    expect(registry.get("create_payment_followup")).toBeUndefined();
  });

  it("allows payment follow-up only as a ChangeSet operation", async () => {
    const registry = createMealPlanToolRegistry();
    const beforePaymentStatus = db.getCustomer("cus_001")?.payment_status;

    await expect(
      registry.execute("create_payment_followup", {
        modelArgs: { reason: "failed_payment" },
        context
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_NOT_FOUND" }
    });

    const result = await registry.execute("create_change_set", {
      modelArgs: {
        change_set_id: "cs_registry_payment_followup",
        operations: [
          { type: "create_payment_followup", reason: "failed_payment" }
        ]
      },
      context
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect((result.data as ChangeSet).operations).toEqual([
      { type: "create_payment_followup", reason: "failed_payment" }
    ]);
    expect(db.getCustomer("cus_001")?.payment_status).toBe(
      beforePaymentStatus
    );
    expect(db.listPaymentFollowups("cus_001")).toHaveLength(0);
  });

  it("keeps kitchen delta creation internal-only", async () => {
    const registry = createMealPlanToolRegistry();

    await expect(
      registry.execute("create_kitchen_export_delta", {
        modelArgs: { dates: ["2026-05-18"] },
        context
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_NOT_FOUND" }
    });

    await expect(
      registry.execute("create_change_set", {
        modelArgs: {
          operations: [
            { type: "create_kitchen_export_delta", dates: ["2026-05-18"] }
          ]
        },
        context
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_INVALID_ARGS" }
    });
    expect(db.listKitchenExportDeltas("cus_001")).toHaveLength(0);
  });
});
