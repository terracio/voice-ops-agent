import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../src/domain/db";
import { EVAL_REFERENCE_DATE } from "../src/domain/seed";
import { PolicyId } from "../src/domain/schema";
import {
  createToolRegistry,
  readTools,
  type ToolExecutionContext
} from "../src/tools";

const omarContext: ToolExecutionContext = {
  run_id: "run_locked_resolver",
  session_id: "session_locked_resolver",
  actor: "agent",
  current_user_turn_id: "turn_001",
  last_user_message: "Please pause tomorrow's meal.",
  identity_status: "confirmed",
  resolved_customer_id: "cus_002",
  current_time: "2026-05-11T10:00:00Z",
  reference_time: "2026-05-11T10:00:00Z"
};

function registry() {
  return createToolRegistry(readTools);
}

beforeEach(() => {
  resetDb("omar_locked_cutoff");
});

describe("locked date resolver tool", () => {
  it("returns locked service dates as blocked non-actionable candidates", async () => {
    const result = await registry().execute("resolve_service_dates", {
      modelArgs: { phrase: "Pause tomorrow's meal." },
      context: omarContext
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        reference_date: EVAL_REFERENCE_DATE,
        ambiguous: false,
        actionable_service_dates: [],
        policy_ids: [PolicyId.LOCKED_SERVICE_DATE_FORBIDDEN],
        write_blocked: true,
        resolved_dates: [
          {
            calendar_date: "2026-05-12",
            service_date: "2026-05-12",
            status: "locked",
            actionable: false,
            non_actionable_reason: "kitchen_locked"
          }
        ]
      }
    });
  });
});
