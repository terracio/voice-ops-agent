import { beforeEach, describe, expect, it } from "vitest";
import * as db from "../src/domain/db";
import { resolveServiceDates } from "../src/domain/dateResolver";
import { PolicyId } from "../src/domain/schema";
import { changeSetTools } from "../src/tools/changeSetTools";
import { createToolRegistry, type ToolExecutionContext } from "../src/tools";

const CREATED_AT = "2026-05-11T10:00:00Z";

beforeEach(() => db.resetDb());

function context(
  overrides: Partial<ToolExecutionContext> = {}
): ToolExecutionContext {
  return {
    run_id: "run_changeset_date_security",
    session_id: "session_changeset_date_security",
    actor: "agent",
    current_user_turn_id: "turn_001",
    last_user_message: "Can you pause next Monday?",
    identity_status: "confirmed",
    resolved_customer_id: "cus_001",
    current_time: CREATED_AT,
    reference_time: CREATED_AT,
    ...overrides
  };
}

describe("ChangeSet date-resolution security", () => {
  it("rejects date mutations without server-generated resolver evidence", async () => {
    const registry = createToolRegistry(changeSetTools);

    await expect(
      registry.execute("create_change_set", {
        modelArgs: {
          change_set_id: "cs_missing_date_resolution",
          operations: [{ type: "pause_dates", dates: ["2026-05-18"] }]
        },
        context: context()
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "DATE_RESOLUTION_REQUIRED",
        policy_id: PolicyId.AMBIGUOUS_DATE
      }
    });
  });

  it("rejects forged non-ambiguous resolver-shaped arguments", async () => {
    const registry = createToolRegistry(changeSetTools);

    await expect(
      registry.execute("create_change_set", {
        modelArgs: {
          change_set_id: "cs_forged_date_resolution",
          operations: [{ type: "pause_dates", dates: ["2026-05-18"] }],
          date_resolution: {
            customer_id: "cus_001",
            timezone: "Asia/Dubai",
            reference_date: "2026-05-11",
            phrase: "forged",
            resolved_dates: [],
            actionable_service_dates: ["2026-05-18"],
            ambiguous: false
          }
        },
        context: context()
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "DATE_RESOLUTION_REQUIRED",
        policy_id: PolicyId.AMBIGUOUS_DATE
      }
    });
  });

  it("allows date mutations covered by trusted resolver evidence", async () => {
    const registry = createToolRegistry(changeSetTools);
    const trustedResolution = resolveServiceDates({
      customer_id: "cus_001",
      phrase: "Please pause Monday.",
      requested_days: ["Monday"]
    });

    await expect(
      registry.execute("create_change_set", {
        modelArgs: {
          change_set_id: "cs_trusted_date_resolution",
          operations: [{ type: "pause_dates", dates: ["2026-05-18"] }]
        },
        context: context({
          trusted_date_resolutions: [trustedResolution]
        })
      })
    ).resolves.toMatchObject({
      ok: true,
      data: {
        change_set_id: "cs_trusted_date_resolution",
        customer_id: "cus_001"
      }
    });
  });

  it("rejects dates outside trusted actionable resolver output", async () => {
    const registry = createToolRegistry(changeSetTools);
    const trustedResolution = resolveServiceDates({
      customer_id: "cus_001",
      phrase: "next week",
      requested_days: ["Monday", "Tuesday"]
    });

    await expect(
      registry.execute("create_change_set", {
        modelArgs: {
          change_set_id: "cs_non_actionable_date",
          operations: [{
            type: "pause_dates",
            dates: ["2026-05-18", "2026-05-19"]
          }]
        },
        context: context({
          trusted_date_resolutions: [trustedResolution]
        })
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { policy_id: PolicyId.AMBIGUOUS_DATE }
    });
  });
});
