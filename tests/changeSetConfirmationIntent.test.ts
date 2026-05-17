import { beforeEach, describe, expect, it } from "vitest";
import * as db from "../src/domain/db";
import { resolveServiceDates } from "../src/domain/dateResolver";
import { PolicyId, type ChangeSet, type ToolResult } from "../src/domain/schema";
import { changeSetTools } from "../src/tools/changeSetTools";
import { createToolRegistry, type ToolExecutionContext } from "../src/tools";

const CREATED_AT = "2026-05-11T10:00:00Z";
const PREVIEWED_AT = "2026-05-11T10:01:00Z";
const CONFIRMED_AT = "2026-05-11T10:02:00Z";
const COMMITTED_AT = "2026-05-11T10:03:00Z";

beforeEach(() => db.resetDb());

function context(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    run_id: "run_confirmation_intent",
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
  if (!result.ok) throw new Error(result.error.message);
  return result.data as T;
}

async function createPreviewedChangeSet(): Promise<ChangeSet> {
  const registry = createToolRegistry(changeSetTools);
  const created = expectData<ChangeSet>(await registry.execute("create_change_set", {
    modelArgs: {
      change_set_id: "cs_negating_confirmation",
      operations: [{ type: "pause_dates", dates: ["2026-05-18"], reason: "travel" }]
    },
    context: context({ current_time: CREATED_AT })
  }));
  expect(await registry.execute("preview_change_set", {
    modelArgs: { change_set_id: created.change_set_id },
    context: context({ current_time: PREVIEWED_AT })
  })).toMatchObject({ ok: true });
  return created;
}

describe("ChangeSet confirmation intent boundary", () => {
  it("does not commit when the post-preview turn negates the change", async () => {
    const registry = createToolRegistry(changeSetTools);
    const changeSet = await createPreviewedChangeSet();

    await expect(registry.execute("capture_confirmation", {
      modelArgs: { change_set_id: changeSet.change_set_id },
      context: context({
        current_time: CONFIRMED_AT,
        current_user_turn_id: "turn_negating",
        last_user_message: "confirm do not skip it"
      })
    })).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFIRMATION_NOT_EXPLICIT" }
    });

    const stored = db.getChangeSet(changeSet.change_set_id);
    expect(stored?.status).toBe("previewed");
    expect(stored?.confirmation_id).toBeUndefined();
    await expect(registry.execute("commit_change_set", {
      modelArgs: {
        change_set_id: changeSet.change_set_id,
        confirmation_id: "conf_negating"
      },
      context: context({ current_time: COMMITTED_AT })
    })).resolves.toMatchObject({
      ok: false,
      error: { policy_id: PolicyId.MISSING_CONFIRMATION }
    });
  });
});
